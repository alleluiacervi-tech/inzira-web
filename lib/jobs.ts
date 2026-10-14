// Scheduled work, run by /api/cron (see vercel.json). Every task is safe to run twice.
import { and, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import { retentionSweep } from "./privacy";
import { allow } from "./ratelimit";
import { deliverDue, enqueue, pruneOutbox, sendNow as deliverOne } from "./outbox";
import { reconcileStalePayments } from "./billing";
import { db, iso, schema as s } from "./db";
import { rwf } from "./format";
import { english, msg, sms } from "./i18n/stored";
import { event, notify } from "./mutate";
import { amountDue } from "./status";

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
const kigaliDate = (t = Date.now()) => new Date(t + 2 * 3600e3).toISOString().slice(0, 10);

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
    .where(and(isNull(s.requests.closed), ne(s.requests.stage, "completed")));
  const endOfToday = Date.parse(`${today}T23:59:59+02:00`);
  const threeDaysAgo = Date.now() - 3 * 864e5;
  const unassigned = open.filter((r) => !r.agentId).length;
  let sent = 0;
  const queued: number[] = [];
  for (const p of people) {
    const mine = open.filter((r) => r.agentId === p.id);
    const followUps = mine.filter((r) => r.followUp && Date.parse(r.followUp.at) <= endOfToday).length;
    const waiting = mine.filter((r) => r.hold && Date.parse(r.hold.since) < threeDaysAgo).length;
    const lead = p.role === "Owner" || p.role === "Administrator" || p.role === "Supervisor";
    const parts = [
      followUps && `${followUps} follow-up${followUps === 1 ? "" : "s"} due`,
      waiting && `${waiting} case${waiting === 1 ? "" : "s"} waiting on the customer for over 3 days`,
      lead && unassigned && `${unassigned} new request${unassigned === 1 ? "" : "s"} with no agent`,
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
    retention: retentionSweep,
    messages: deliverDue,
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
