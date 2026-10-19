// Settling payments. One function decides the outcome of a pending mobile money prompt, whoever
// asks: the customer's screen, the provider's callback, or the background job. It always asks the
// provider directly and never trusts what a callback says.
import { and, eq, lt } from "drizzle-orm";
import { db, iso, schema as s } from "./db";
import { rwf } from "./format";
import { msg, sms } from "./i18n/stored";
import { audit, event, notify } from "./mutate";
import { allow } from "./ratelimit";
import { PROMPT_TTL_MS, providerStatus, type PayStatus } from "./payments";

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
    if (r.hold?.reason === "payment") await tx.update(s.requests).set({ hold: null }).where(eq(s.requests.ref, t.ref));
    const paid = { total: rwf(t.official + t.ours), official: rwf(t.official), ours: rwf(t.ours), receipt: t.receipt };
    await event(tx, t.ref, msg("ev.paymentReceived", { amount: paid.total }), "system");
    await notify(tx, t.ref, { icon: "check", title: msg(t.official ? "nt.paymentReceivedSplit" : "nt.paymentReceived", paid), sms: sms("paymentReceived", paid) });
    await audit(tx, { actor: "System", role: "—", action: late ? "Payment reconciled after the prompt had timed out" : "Payment reconciled", entity: `${t.receipt} · ${rwf(t.official)} official + ${rwf(t.ours)} ours · ${t.method}`, fee: true });
  });
  return status;
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
