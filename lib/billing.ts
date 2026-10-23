// Settling payments. One function decides the outcome of a pending mobile money prompt, whoever
// asks: the customer's screen, the provider's callback, or the background job. It always asks the
// provider directly and never trusts what a callback says.
import { and, eq, lt, sql } from "drizzle-orm";
import { db, iso, schema as s, type Db } from "./db";
import { prettyPhone, rwf } from "./format";
import { english, msg, sms } from "./i18n/stored";
import { audit, event, notify } from "./mutate";
import { notifyStaff } from "./staff-alerts";
import { allow } from "./ratelimit";
import { PROMPT_TTL_MS, providerStatus, type PayStatus } from "./payments";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const UNREACHABLE_TTL_MS = 60 * 60e3;
/** A prompt we closed as failed can still be approved on the phone later. A callback re-checks it for this long. */
const LATE_APPROVAL_WINDOW_MS = 7 * 24 * 60 * 60e3;

/** Settles one prompt. With `declined`, set only for an authenticated provider callback that names this prompt and says it
 *  failed: a prompt the provider still reports as pending is closed at once instead of after the time limit. It never
 *  makes a payment paid, and a provider answer of paid still wins. With `late`, a prompt already closed as failed is asked about again, because the customer can
 *  approve after our time limit: if the provider says it was paid, the money is recorded instead of lost. */
export async function reconcilePayment(txId: number, opts: { late?: boolean; declined?: boolean } = {}): Promise<PayStatus | null> {
  const d = await db();
  const [t] = await d.select().from(s.transactions).where(eq(s.transactions.id, txId));
  if (!t) return null;
  const reopened = t.status === "failed" && !!opts.late && !!t.providerRef && Date.now() - Date.parse(iso(t.at)!) < LATE_APPROVAL_WINDOW_MS;
  if (t.status !== "pending" && !reopened) return t.status === "paid" ? "paid" : "failed";

  let status: PayStatus;
  let providerTxId: string | undefined;
  let unreachable = false;
  try {
    ({ status, providerTxId } = await providerStatus(t.providerRef ?? ""));
  } catch (e) {
    if (reopened) return "failed"; // no record at the provider, or it could not say: the prompt stays closed
    // The provider could not say (a timeout, or it has no record of the prompt). Wait, but not for ever: after the
    // time limit below the prompt is closed so the customer can try again.
    console.error("[payments] status check failed", e);
    status = "pending";
    unreachable = true;
  }
  // Nobody approved the prompt in time: close it so the customer can try again. When the provider could not be asked at
  // all, wait longer: closing a prompt that was in fact paid would invite a second payment.
  if (opts.declined && !reopened && status === "pending") status = "failed";
  const age = Date.now() - Date.parse(iso(t.at)!);
  if (reopened) return status === "paid" ? settle(t, "paid", providerTxId, true) : "failed";
  if (status === "pending" && age > (unreachable ? UNREACHABLE_TTL_MS : PROMPT_TTL_MS)) status = "failed";
  if (status === "pending") return "pending";
  return settle(t, status, providerTxId, false);
}

/** How often a customer's screen may make us ask the provider about one payment, however many screens are open. */
const SCREEN_CHECK_EVERY_MS = 8e3;

/** For a customer's screen polling a prompt. A real provider is asked at most once per interval; in between, the
 *  answer is "pending" without a call. The provider's callback and the scheduled job go through reconcilePayment. */
export async function reconcileForScreen(txId: number): Promise<PayStatus | null> {
  const d = await db();
  const [t] = await d.select({ status: s.transactions.status, providerRef: s.transactions.providerRef }).from(s.transactions).where(eq(s.transactions.id, txId));
  if (!t) return null;
  const real = t.status === "pending" && !!t.providerRef && !t.providerRef.startsWith("sim:");
  if (real && !(await allow(`status:tx:${txId}`, 1, SCREEN_CHECK_EVERY_MS))) return "pending";
  return reconcilePayment(txId);
}

type Payment = typeof s.transactions.$inferSelect;

/** Writes the outcome once. `late` marks a payment approved after we had already closed the prompt as failed. */
async function settle(t: Payment, status: PayStatus, providerTxId: string | undefined, late: boolean): Promise<PayStatus> {
  const d = await db();
  const txId = t.id;

  await d.transaction(async (tx) => {
    const [updated] = await tx.update(s.transactions)
      .set({ status, at: new Date().toISOString(), ...(providerTxId ? { providerRef: `${t.providerRef}|${providerTxId}` } : {}) })
      .where(and(eq(s.transactions.id, txId), eq(s.transactions.status, late ? "failed" : "pending"))).returning();
    if (!updated) return; // someone else settled it first
    if (status !== "paid") {
      await event(tx, t.ref, msg("ev.paymentFailed", { amount: rwf(t.official + t.ours) }), "system");
      return;
    }
    const [r] = await tx.select().from(s.requests).where(eq(s.requests.ref, t.ref));
    const paid = { total: rwf(t.official + t.ours), official: rwf(t.official), ours: rwf(t.ours), receipt: t.receipt };
    await event(tx, t.ref, msg("ev.paymentReceived", { amount: paid.total }), "system");
    if (r.checkout === "open" && (await checkoutPaid(tx, r))) {
      await openPaidCheckout(tx, r, { ...paid, method: t.method });
    } else {
      if (r.hold?.reason === "payment") await tx.update(s.requests).set({ hold: null }).where(eq(s.requests.ref, t.ref));
      await notify(tx, t.ref, { icon: "check", title: msg(t.official ? "nt.paymentReceivedSplit" : "nt.paymentReceived", paid), sms: sms("paymentReceived", paid) });
      await notifyStaff(tx, t.ref, { kind: "payment", icon: "card", title: `Payment received on ${t.ref}`, body: `${paid.total} · ${t.method}` });
    }
    await audit(tx, { actor: "System", role: "—", action: late ? "Payment reconciled after the prompt had timed out" : "Payment reconciled", entity: `${t.receipt} · ${rwf(t.official)} official + ${rwf(t.ours)} ours · ${t.method}`, fee: true });
  });
  return status;
}

type RequestRow = typeof s.requests.$inferSelect;

/** Whether what was paid covers what the checkout asked for: the review fee of a quoted request, or the whole price. */
export async function checkoutPaid(tx: Tx, r: RequestRow): Promise<boolean> {
  const all = await tx.select({ official: s.transactions.official, ours: s.transactions.ours }).from(s.transactions)
    .where(and(eq(s.transactions.ref, r.ref), eq(s.transactions.status, "paid")));
  return all.reduce((n, x) => n + x.official + x.ours, 0) >= (r.reviewFee ?? (r.official ?? 0) + r.ours);
}

/** Pay to submit: the paid checkout becomes a request in the staff queue now, and its clock starts now. One closed as unpaid
 *  is opened again: the money arrived (a prompt approved late, or cash at the office), so the customer still wants it done.
 *  A request sent with a review fee goes on to be quoted; the fee counts toward what the quote asks for. */
export async function openPaidCheckout(tx: Tx, r: RequestRow, paid: { total: string; official: string; ours: string; receipt: string; method: string }) {
  const [who] = await tx.select({ name: s.accounts.name, email: s.accounts.email, phone: s.accounts.phone }).from(s.profiles)
    .innerJoin(s.accounts, eq(s.accounts.id, s.profiles.accountId)).where(eq(s.profiles.id, r.profileId));
  const [svc] = await tx.select({ name: s.services.name }).from(s.services).where(eq(s.services.slug, r.serviceSlug));
  const contact = who?.email ?? prettyPhone(who?.phone);
  const summary = r.reviewFee ? msg("sum.reviewPaid", { contact, fee: rwf(r.reviewFee) }) : msg("sum.received", { contact });
  await tx.update(s.requests).set({
    checkout: "paid", hold: null, closed: null, stageDates: { ...r.stageDates, received: new Date().toISOString() },
    summary: { title: english(summary, "title"), body: english(summary, "body"), msg: summary }, next: english(summary, "next"),
  }).where(eq(s.requests.ref, r.ref));
  await event(tx, r.ref, msg("ev.sentToTeam"), "system");
  const { method: _method, ...vars } = paid;
  await notify(tx, r.ref, { icon: "check", title: msg("nt.checkoutPaid", { total: paid.total, ref: r.ref }), sms: sms("checkoutPaid", vars) });
  await notifyStaff(tx, r.ref, r.reviewFee
    ? { kind: "new", icon: "card", title: `New request ${r.ref} · review fee paid`, body: `${who?.name ?? "Customer"} · ${svc?.name ?? r.serviceSlug} · ${paid.total} by ${paid.method}. Check it and send the quote.` }
    : { kind: "new", icon: "card", title: `New paid request ${r.ref}`, body: `${who?.name ?? "Customer"} · ${svc?.name ?? r.serviceSlug} · ${paid.total} paid by ${paid.method}` });
}

/** Staff closed a request the customer had paid for, before it was filed with the institution: we promise the money back
 *  (a review fee when we could not take it on, everything else when we could not file it; a review fee for a request we
 *  quoted paid for that check and is kept). Staff are told on the case,
 *  and in the audit log, to refund it from Payments (which sends it through IntouchPay). A request already with the
 *  institution follows its rules, so nothing is flagged for it. */
export async function noteRefundDue(tx: Tx, ref: string, by: { id: string; name: string; role: string }) {
  const [r] = await tx.select({ reviewFee: s.requests.reviewFee, quote: s.requests.quote, stage: s.requests.stage }).from(s.requests).where(eq(s.requests.ref, ref));
  if (!r || r.stage === "institution" || r.stage === "completed") return;
  const paid = await tx.select({ amount: sql<number>`${s.transactions.official} + ${s.transactions.ours}`, payer: s.transactions.payer, receipt: s.transactions.receipt })
    .from(s.transactions).where(and(eq(s.transactions.ref, ref), eq(s.transactions.status, "paid")));
  if (!paid.length) return;
  // Once a quote has been sent, the review fee paid for that check and is kept; anything paid beyond it is owed back.
  const kept = r.reviewFee && r.quote !== "estimate" ? r.reviewFee : 0;
  const total = paid.reduce((n, p) => n + Number(p.amount), 0) - kept;
  if (total <= 0) return;
  const to = paid.map((p) => p.payer).filter(Boolean).map((p) => prettyPhone(p)).join(", ") || "the number that paid";
  const reviewOnly = !!r.reviewFee && r.quote === "estimate";
  const what = reviewOnly ? `a ${rwf(total)} review fee and the request was closed before it was quoted` : `${rwf(total)} and the request was closed before it was filed`;
  await tx.insert(s.notes).values({ ref, by: by.id, body: `Refund due: the customer paid ${what}. Refund it from Admin › Payments: it goes back to ${to} by mobile money.` });
  await audit(tx, { actor: by.name, role: by.role, action: reviewOnly ? "Review fee to refund" : "Payment to refund", entity: `${ref} · ${rwf(total)} · ${paid.map((p) => p.receipt).join(", ")}`, fee: true });
}

/** Settles every prompt still pending after a minute (for customers who closed the page). */
export async function reconcileStalePayments() {
  const d = await db();
  const pending = await d.select({ id: s.transactions.id }).from(s.transactions)
    .where(and(eq(s.transactions.status, "pending"), lt(s.transactions.at, new Date(Date.now() - 60e3).toISOString())));
  let settled = 0;
  for (const p of pending) if ((await reconcilePayment(p.id)) !== "pending") settled++;
  return { checked: pending.length, settled };
}
