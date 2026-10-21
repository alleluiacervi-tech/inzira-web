// Scheduled work, run by /api/cron (see vercel.json). Every task is safe to run twice.
import { and, eq, gt, inArray, isNotNull, isNull, lt, ne, type SQL } from "drizzle-orm";
import { retentionSweep } from "./privacy";
import { allow } from "./ratelimit";
import { deliverDue, enqueue, pruneOutbox, sendNow as deliverOne } from "./outbox";
import { reconcileStalePayments } from "./billing";
import { db, iso, schema as s } from "./db";
import { rwf } from "./format";
import { english, feeVars, msg, sms } from "./i18n/stored";
import { audit, event, notify } from "./mutate";
import { amountDue, payableNow } from "./status";
import { countTaxAttention } from "./tax-diary";
import { kigaliToday } from "./tax-calendar";

/** Requests whose fees were sent, are past due and unpaid go on hold, with one SMS reminder. */
export async function holdOverduePayments() {
  const d = await db();
  const now = new Date().toISOString();
  // Only requests that can be overdue are read, and their payments come in one query, not one per request.
  const rows = await d.select().from(s.requests).where(and(isNull(s.requests.closed), isNull(s.requests.hold), lt(s.requests.dueAt, now), ne(s.requests.stage, "completed"), ne(s.requests.quote, "estimate")));
  if (!rows.length) return { held: 0 };
  const allTxs = await d.select().from(s.transactions).where(inArray(s.transactions.ref, rows.map((r) => r.ref)));
  let held = 0;
  for (const r of rows) {
    const txs = allTxs.filter((t) => t.ref === r.ref);
    const due = amountDue({
      invoice: r.invoice, official: r.official, officialMode: r.officialMode ?? undefined, officialLabel: r.officialLabel, ours: r.ours, oursStandard: r.oursStandard,
      quote: r.quote, officialReceipt: r.officialReceipt, transactions: txs.map((t) => ({ receipt: t.receipt, at: iso(t.at)!, method: t.method, official: t.official, ours: t.ours, status: t.status })),
    });
    if (due <= 0 || txs.some((t) => t.status === "pending")) continue;
    await d.transaction(async (tx) => {
      const amount = rwf(due);
      const holdMsg = msg("hold.overdue", { amount });
      await tx.update(s.requests).set({ hold: { reason: "payment", title: english(holdMsg, "title"), detail: english(holdMsg, "detail"), since: now, msg: holdMsg } }).where(and(eq(s.requests.ref, r.ref), isNull(s.requests.hold)));
      await event(tx, r.ref, msg("ev.paymentReminder", { amount }), "system");
      await notify(tx, r.ref, { icon: "card", title: msg("nt.overdue", { amount, ref: r.ref }), sms: sms("overdue", { amount }) });
    });
    held++;
  }
  return { held };
}

/** Open requests with something to pay, narrowed by `extra`: confirmed fees not paid, or a checkout (the whole price or a
 *  review fee) not paid. Ones with a prompt waiting on the customer's phone are left out. */
async function unpaidRequests(extra: SQL | undefined) {
  const d = await db();
  const rows = await d.select().from(s.requests).where(and(isNull(s.requests.closed), ne(s.requests.stage, "completed"), extra));
  if (!rows.length) return [];
  const allTxs = await d.select().from(s.transactions).where(inArray(s.transactions.ref, rows.map((r) => r.ref)));
  return rows.flatMap((r) => {
    const txs = allTxs.filter((t) => t.ref === r.ref);
    const due = payableNow({
      invoice: r.invoice, official: r.official, officialMode: r.officialMode ?? undefined, officialLabel: r.officialLabel, ours: r.ours, oursStandard: r.oursStandard,
      quote: r.quote, officialReceipt: r.officialReceipt, reviewFee: r.reviewFee ?? undefined,
      transactions: txs.map((t) => ({ receipt: t.receipt, at: iso(t.at)!, method: t.method, official: t.official, ours: t.ours, status: t.status })),
    }, r.checkout === "open").amount;
    return due > 0 && !txs.some((t) => t.status === "pending") ? [{ r, due }] : [];
  });
}
/** Quotes an agent sent. Unpaid checkouts have their own reminder and expiry below. */
const unpaidQuotes = (extra: SQL | undefined) => unpaidRequests(and(ne(s.requests.checkout, "open"), ne(s.requests.quote, "estimate"), isNotNull(s.requests.dueAt), extra));
/** Requests started at checkout (pay to submit) and not paid. */
const unpaidCheckouts = (extra: SQL | undefined) => unpaidRequests(and(eq(s.requests.checkout, "open"), extra));

/** Fees are due three days after they are sent (see sendQuote). A day in, a customer who has not paid gets the fees again, once. */
export async function remindUnpaidQuotes() {
  const d = await db();
  const now = new Date().toISOString();
  const soon = new Date(Date.now() + 2 * 864e5).toISOString();
  let reminded = 0;
  for (const { r } of await unpaidQuotes(and(gt(s.requests.dueAt, now), lt(s.requests.dueAt, soon)))) {
    // Once per request: the counter's window outlasts any quote.
    if (!(await allow(`quote-nudge:${r.ref}`, 1, 90 * 864e5))) continue;
    const fees = { ...feeVars(r.officialMode, r.official), ours: rwf(r.ours) };
    await d.transaction((tx) => notify(tx, r.ref, { icon: "card", title: msg("nt.fees", { ref: r.ref, ...fees }), sms: sms("fees", fees) }));
    reminded++;
  }
  return { reminded };
}

/** A week after the fees were sent (four days after they fell due), an unpaid request that nobody has started work on is closed,
 *  so the queue does not fill with requests that will never be paid. The customer is told, and can start again at any time. */
export async function expireUnpaidQuotes() {
  const d = await db();
  const cutoff = new Date(Date.now() - 4 * 864e5).toISOString();
  let expired = 0;
  for (const { r, due } of await unpaidQuotes(and(lt(s.requests.dueAt, cutoff), inArray(s.requests.stage, ["received", "checking"])))) {
    const reason = msg("closed.quoteExpired");
    // "Nothing was charged" is not true of a request sent with a review fee: that paid for checking it.
    const summary = r.reviewFee && r.checkout === "paid" ? msg("sum.quoteExpiredReview", { fee: rwf(r.reviewFee) }) : msg("sum.quoteExpired");
    await d.transaction(async (tx) => {
      const [closed] = await tx.update(s.requests).set({
        closed: { kind: "cancelled", at: new Date().toISOString(), reason: english(reason), msg: reason }, hold: null,
        summary: { title: english(summary, "title"), body: english(summary, "body"), msg: summary }, next: english(summary, "next"),
      }).where(and(eq(s.requests.ref, r.ref), isNull(s.requests.closed))).returning({ ref: s.requests.ref });
      if (!closed) return; // someone closed it first
      await event(tx, r.ref, msg("ev.quoteExpired"), "system");
      await notify(tx, r.ref, { icon: "alert", title: msg("nt.quoteExpired", { ref: r.ref }), sms: sms("quoteExpired", { ref: r.ref }) });
      await audit(tx, { actor: "System", role: "—", action: "Closed an unpaid request", entity: `${r.ref} · ${rwf(due)} not paid within a week of the quote` });
    });
    expired++;
  }
  return { expired };
}

/** How long an unpaid checkout stays open. The customer is told so on the payment screen. */
const CHECKOUT_DAYS = 3;

/** A customer who left the checkout without paying hears once, a couple of hours on, that the request has not been sent. */
export async function remindOpenCheckouts() {
  const d = await db();
  let reminded = 0;
  // Not one about to be closed: three days unpaid is closed by expireOpenCheckouts, in the same run.
  const young = and(lt(s.requests.openedAt, new Date(Date.now() - 2 * 3600e3).toISOString()), gt(s.requests.openedAt, new Date(Date.now() - CHECKOUT_DAYS * 864e5).toISOString()));
  for (const { r, due } of await unpaidCheckouts(young)) {
    if (!(await allow(`checkout-nudge:${r.ref}`, 1, 90 * 864e5))) continue;
    const vars = { total: rwf(due), ref: r.ref };
    await d.transaction((tx) => notify(tx, r.ref, { icon: "card", title: msg("nt.checkoutReminder", vars), sms: sms("checkoutReminder", vars) }));
    reminded++;
  }
  return { reminded };
}

/** Three days on, an unpaid checkout is closed. It never reached staff, so nobody's work is lost; the customer can start again. */
export async function expireOpenCheckouts() {
  const d = await db();
  let expired = 0;
  for (const { r, due } of await unpaidCheckouts(lt(s.requests.openedAt, new Date(Date.now() - CHECKOUT_DAYS * 864e5).toISOString()))) {
    const reason = msg("closed.checkoutExpired");
    const summary = msg("sum.checkoutExpired");
    await d.transaction(async (tx) => {
      const [closed] = await tx.update(s.requests).set({
        closed: { kind: "cancelled", at: new Date().toISOString(), reason: english(reason), msg: reason }, hold: null,
        summary: { title: english(summary, "title"), body: english(summary, "body"), msg: summary }, next: english(summary, "next"),
      }).where(and(eq(s.requests.ref, r.ref), isNull(s.requests.closed), eq(s.requests.checkout, "open"))).returning({ ref: s.requests.ref });
      if (!closed) return; // paid or closed a moment earlier
      await event(tx, r.ref, msg("ev.checkoutExpired"), "system");
      // In the portal only: the customer was already reminded once by SMS or email.
      await notify(tx, r.ref, { icon: "alert", title: msg("nt.checkoutExpired", { ref: r.ref }) });
      await audit(tx, { actor: "System", role: "—", action: "Closed an unpaid checkout", entity: `${r.ref} · ${rwf(due)} not paid within three days` });
    });
    expired++;
  }
  return { expired };
}

/** Removes expired sign-in codes, sessions, old rate-limit counters and delivered messages. */
export async function cleanUp() {
  const d = await db();
  const now = new Date().toISOString();
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  await d.delete(s.otpCodes).where(lt(s.otpCodes.expiresAt, now));
  await d.delete(s.emailCodes).where(lt(s.emailCodes.expiresAt, now));
  await pruneOutbox();
  await d.delete(s.sessions).where(lt(s.sessions.expiresAt, now));
  await d.delete(s.rateLimits).where(lt(s.rateLimits.windowStart, dayAgo));
  return { ok: true };
}

/** Kigali's calendar date (UTC+2, no daylight saving), e.g. "2026-10-02". */
const kigaliDate = (t = Date.now()) => kigaliToday(t);

/**
 * One SMS a day to each member of staff with something waiting: their follow-ups due today or earlier,
 * and their cases waiting on the customer for more than three days. Supervisors and above also hear how
 * many new requests have no agent yet. Sent at most once a day, however often the job runs.
 */
export async function staffDigest() {
  const today = kigaliDate();
  const d = await db();
  const people = (await d.select().from(s.staff).where(eq(s.staff.active, true))).filter((p) => p.phone);
  const open = await d.select({ agentId: s.requests.agentId, followUp: s.requests.followUp, hold: s.requests.hold, stage: s.requests.stage, closed: s.requests.closed }).from(s.requests)
    .where(and(isNull(s.requests.closed), ne(s.requests.stage, "completed"), ne(s.requests.checkout, "open")));
  const endOfToday = Date.parse(`${today}T23:59:59+02:00`);
  const threeDaysAgo = Date.now() - 3 * 864e5;
  const unassigned = open.filter((r) => !r.agentId).length;
  const taxesDue = await countTaxAttention(today).catch(() => 0);
  let sent = 0;
  const queued: number[] = [];
  for (const p of people) {
    const mine = open.filter((r) => r.agentId === p.id);
    const followUps = mine.filter((r) => r.followUp && Date.parse(r.followUp.at) <= endOfToday).length;
    const waiting = mine.filter((r) => r.hold && Date.parse(r.hold.since) < threeDaysAgo).length;
    const lead = p.role === "Owner" || p.role === "Administrator" || p.role === "Supervisor" || p.role === "Finance";
    const taxes = lead ? taxesDue : 0;
    const parts = [
      followUps && `${followUps} follow-up${followUps === 1 ? "" : "s"} due`,
      waiting && `${waiting} case${waiting === 1 ? "" : "s"} waiting on the customer for over 3 days`,
      lead && unassigned && `${unassigned} new request${unassigned === 1 ? "" : "s"} with no agent`,
      taxes && `${taxes} tax deadline${taxes === 1 ? "" : "s"} to clear`,
    ].filter(Boolean);
    if (!parts.length) continue;
    // The guard key is per person and day, so a second run the same day sends nothing.
    if (!(await allow(`digest:${p.id}:${today}`, 1, 864e5))) continue;
    // Queued, so a failed first try is retried by the outbox instead of being lost with the day's only allowed send.
    queued.push(await enqueue(d, { channel: "sms", to: p.phone!, message: `Inzira today: ${parts.join(", ")}. Open the staff console to see them.` }));
    sent++;
  }
  await Promise.all(queued.map((id) => deliverOne(id)));
  return { sent };
}

/** Every task runs on its own: one that fails is recorded and does not stop the rest. */
export async function runAll() {
  const tasks = {
    payments: reconcileStalePayments,
    overdue: holdOverduePayments,
    quoteReminders: remindUnpaidQuotes,
    unpaidExpiry: expireUnpaidQuotes,
    checkoutReminders: remindOpenCheckouts,
    checkoutExpiry: expireOpenCheckouts,
    retention: retentionSweep,
    messages: deliverDue,
    taxes: () => countTaxAttention().then((attention) => ({ attention })),
    digest: staffDigest,
    cleanUp,
  };
  const out: Record<string, unknown> = {};
  let failed = 0;
  for (const [name, task] of Object.entries(tasks)) {
    try { out[name] = await task(); } catch (e) {
      failed++;
      out[name] = { error: e instanceof Error ? e.message : String(e) };
      console.error(`[cron] ${name} failed`, e);
    }
  }
  return { ...out, failed };
}

/** Runs every task and records the run, so the admin console can show when the job last worked. */
export async function runAndRecord() {
  const started = Date.now();
  let ok = true;
  let result: Record<string, unknown>;
  try {
    result = await runAll();
    ok = result.failed === 0;
    if (!ok) result.error = `${result.failed} task${result.failed === 1 ? "" : "s"} failed: ${Object.entries(result).filter(([, v]) => v && typeof v === "object" && "error" in v).map(([k]) => k).join(", ")}`;
  } catch (e) { ok = false; result = { error: e instanceof Error ? e.message : String(e) }; console.error("[cron]", e); }
  await (await db()).insert(s.jobRuns).values({ ok, result, ms: Date.now() - started }).catch((e) => console.error("[cron] could not record run", e));
  return { ok, ...result };
}
