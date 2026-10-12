// Settling payments. One function decides the outcome of a pending mobile money prompt, whoever
// asks: the customer's screen, the provider's callback, or the background job. It always asks the
// provider directly and never trusts what a callback says.
import { and, eq, lt } from "drizzle-orm";
import { db, iso, schema as s } from "./db";
import { rwf } from "./format";
import { msg, sms } from "./i18n/stored";
import { audit, event, notify } from "./mutate";
import { PROMPT_TTL_MS, providerStatus, type PayStatus } from "./payments";

export async function reconcilePayment(txId: number): Promise<PayStatus | null> {
  const d = await db();
  const [t] = await d.select().from(s.transactions).where(eq(s.transactions.id, txId));
  if (!t) return null;
  if (t.status !== "pending") return t.status === "paid" ? "paid" : "failed";

  let status: PayStatus;
  let providerTxId: string | undefined;
  try {
    ({ status, providerTxId } = await providerStatus(t.providerRef ?? ""));
  } catch (e) {
    console.error("[payments] status check failed", e);
    return "pending";
  }
  // Nobody approved the prompt in time: close it so the customer can try again.
  if (status === "pending" && Date.now() - Date.parse(iso(t.at)!) > PROMPT_TTL_MS) status = "failed";
  if (status === "pending") return "pending";

  await d.transaction(async (tx) => {
    const [updated] = await tx.update(s.transactions)
      .set({ status, at: new Date().toISOString(), ...(providerTxId ? { providerRef: `${t.providerRef}|${providerTxId}` } : {}) })
      .where(and(eq(s.transactions.id, txId), eq(s.transactions.status, "pending"))).returning();
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
    await audit(tx, { actor: "System", role: "—", action: "Payment reconciled", entity: `${t.receipt} · ${rwf(t.official)} official + ${rwf(t.ours)} ours · ${t.method}`, fee: true });
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
