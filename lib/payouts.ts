// Refunds. Our fee goes back to the number that paid, through IntouchPay RequestDeposit (lib/intouchpay.ts). Each refund
// is recorded as a payout before IntouchPay is called, so one whose answer is lost is checked, never sent twice, and the
// request reads as refunded only once IntouchPay says the money was sent. Server only.
import { and, eq, lt } from "drizzle-orm";
import { db, iso, schema as s, type Db } from "./db";
import { isUniqueViolation } from "./db/errors";
import { prettyPhone, rwf } from "./format";
import { msg, sms } from "./i18n/stored";
import { IntouchRejected, depositRefusalMessage, intouchDepositStatus, requestIntouchDeposit } from "./intouchpay";
import { audit, event, notify } from "./mutate";
import { newIntouchRequestId, payoutProvider } from "./payments";

type Staff = { id: string; name: string; role: string };
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** IntouchPay will not send the refund, or it cannot be sent from here. Nothing left the account. For staff. */
export class PayoutRefused extends Error {}

/** A payout IntouchPay never confirmed nor denied is closed as not sent after this long, unless it has no IntouchPay id. */
const UNCONFIRMED_TTL_MS = 60 * 60e3;

/** "intouch:<our id>:<their transaction id>|<their reference>" → its parts. */
const parseRef = (providerRef: string | null) => {
  const [base, reference] = (providerRef ?? "").split("|");
  const [kind, id, transactionId] = base.split(":");
  return { kind, id: id ?? "", transactionId: transactionId || undefined, reference };
};

/** The demo's stand-in for RequestDeposit: a number ending 0000 has "too low a balance", any other is sent at once. */
function simulateDeposit(phone9: string) {
  if (phone9.endsWith("0000")) throw new IntouchRejected("1108", "Simulated: insufficient account balance.");
  return { status: "sent" as const, transactionId: `${Date.now()}`, code: "2001" };
}

/** Sends our fee on every paid payment of a request back to the number that paid it. Official fees already paid are
 *  recovered from the institution, not refunded here. "sent": IntouchPay confirmed and the request is refunded.
 *  "pending": its answer was unclear, so nothing is recorded until the payout is checked (Payments, or the daily job). */
export async function sendRefund(ref: string, by: Staff): Promise<{ status: "sent" | "pending"; amount: number }> {
  const kind = payoutProvider();
  if (!kind) throw new PayoutRefused("Refunds are not sent automatically with this payment setup.");
  const d = await db();
  const paid = await d.select().from(s.transactions).where(and(eq(s.transactions.ref, ref), eq(s.transactions.status, "paid")));
  const amount = paid.reduce((n, t) => n + t.ours, 0);
  if (!amount) throw new PayoutRefused("Nothing to refund on this request.");
  const payer = [...paid].reverse().find((t) => t.payer && /^7\d{8}$/.test(t.payer))?.payer;
  if (!payer) throw new PayoutRefused("This payment has no mobile money number to send the refund to. Send it by hand and record it.");
  const id = kind === "intouch" ? newIntouchRequestId() : `${Date.now()}`;
  let row: { id: number };
  try {
    [row] = await d.insert(s.payouts).values({ ref, amount, phone: payer, reason: `Refund ${ref}`, status: "pending", providerRef: `${kind}:${id}`, by: by.id }).returning({ id: s.payouts.id });
  } catch (e) {
    if (isUniqueViolation(e)) throw new PayoutRefused("A refund for this request is already being sent.");
    throw e;
  }
  let sent: { status: "sent" | "pending"; transactionId?: string; reference?: string; code: string };
  try {
    sent = kind === "sim" ? simulateDeposit(payer) : await requestIntouchDeposit({ requestId: id, phone9: payer, amount, reason: `Inzira refund ${ref}` });
  } catch (e) {
    if (e instanceof IntouchRejected) {
      await d.update(s.payouts).set({ status: "failed", code: e.code, settledAt: new Date().toISOString() }).where(eq(s.payouts.id, row.id));
      await audit(d, { actor: by.name, role: by.role, action: "Refund refused by IntouchPay", entity: `${ref} · ${rwf(amount)} · code ${e.code}`, fee: true });
      throw new PayoutRefused(depositRefusalMessage(e.code, rwf(amount)));
    }
    // No answer: IntouchPay may have sent it. It stays pending and is checked, never sent again.
    console.error("[payouts] RequestDeposit gave no clear answer", e);
    return { status: "pending", amount };
  }
  const providerRef = sent.transactionId ? `${kind}:${id}:${sent.transactionId}${sent.reference ? `|${sent.reference}` : ""}` : `${kind}:${id}`;
  await d.update(s.payouts).set({ providerRef, code: sent.code }).where(eq(s.payouts.id, row.id));
  if (sent.status === "sent") await settlePayout(row.id);
  return { status: sent.status, amount };
}

/** Records a sent refund once: the request's payments read as refunded and the customer is told. */
async function settlePayout(payoutId: number) {
  const d = await db();
  await d.transaction(async (tx) => {
    const [p] = await tx.update(s.payouts).set({ status: "sent", settledAt: new Date().toISOString() })
      .where(and(eq(s.payouts.id, payoutId), eq(s.payouts.status, "pending"))).returning();
    if (!p) return; // settled already
    await tx.update(s.transactions).set({ status: "refunded" }).where(and(eq(s.transactions.ref, p.ref), eq(s.transactions.status, "paid")));
    const amount = rwf(p.amount);
    await event(tx, p.ref, msg("ev.refunded", { amount }), p.by);
    await notify(tx, p.ref, { icon: "refresh", title: msg("nt.refund", { amount, ref: p.ref }), sms: sms("refund", { amount }) });
    const who = await staffOf(tx, p.by);
    await audit(tx, { actor: who.name, role: who.role, action: "Refund sent", entity: `${p.ref} · ${amount} ours · to ${prettyPhone(p.phone)} · ${parseRef(p.providerRef).reference ?? p.providerRef}`, fee: true });
  });
}

async function staffOf(tx: Tx, id: string) {
  const [row] = await tx.select({ name: s.staff.name, role: s.staff.role }).from(s.staff).where(eq(s.staff.id, id));
  return row ?? { name: "System", role: "—" };
}

/** Asks IntouchPay how a refund it never clearly answered stands, and records the outcome once. */
export async function reconcilePayout(payoutId: number): Promise<"sent" | "pending" | "failed"> {
  const d = await db();
  const [p] = await d.select().from(s.payouts).where(eq(s.payouts.id, payoutId));
  if (!p) return "failed";
  if (p.status !== "pending") return p.status;
  const { kind, id, transactionId } = parseRef(p.providerRef);
  if (kind === "sim") { await settlePayout(p.id); return "sent"; }
  // Without IntouchPay's transaction id it cannot be asked: staff check its portal and close it (closeUnclearPayout).
  if (!transactionId) return "pending";
  let status: Awaited<ReturnType<typeof intouchDepositStatus>>;
  try { status = await intouchDepositStatus(id, transactionId); } catch (e) { console.error("[payouts] status check failed", e); return "pending"; }
  if (status === "sent") { await settlePayout(p.id); return "sent"; }
  const old = Date.now() - Date.parse(iso(p.at)!) > UNCONFIRMED_TTL_MS;
  if (status === "failed" || (status === "missing" && old)) { await closePayout(p.id, status === "failed" ? "IntouchPay says it failed" : "IntouchPay has no record of it"); return "failed"; }
  return "pending";
}

/** Closes a refund as not sent: nothing is recorded as refunded, and staff can send it again. */
async function closePayout(payoutId: number, why: string) {
  const d = await db();
  await d.transaction(async (tx) => {
    const [p] = await tx.update(s.payouts).set({ status: "failed", settledAt: new Date().toISOString() })
      .where(and(eq(s.payouts.id, payoutId), eq(s.payouts.status, "pending"))).returning();
    if (!p) return;
    const who = await staffOf(tx, p.by);
    await audit(tx, { actor: who.name, role: who.role, action: "Refund not sent", entity: `${p.ref} · ${rwf(p.amount)} · ${why}`, fee: true });
  });
}

/** For a refund IntouchPay never answered (no id to ask about): staff looked in the IntouchPay portal and it was not sent. */
export async function closeUnclearPayout(payoutId: number, by: Staff): Promise<boolean> {
  const d = await db();
  const [p] = await d.select().from(s.payouts).where(eq(s.payouts.id, payoutId));
  if (!p || p.status !== "pending" || parseRef(p.providerRef).transactionId) return false;
  await closePayout(p.id, `checked in the IntouchPay portal by ${by.name}: not sent`);
  return true;
}

/** Refunds still being sent, for the Payments page. */
export async function listPendingPayouts() {
  const d = await db();
  const rows = await d.select().from(s.payouts).where(eq(s.payouts.status, "pending"));
  return rows.map((p) => ({ id: p.id, ref: p.ref, amount: p.amount, phone: prettyPhone(p.phone), at: iso(p.at)!, requestId: parseRef(p.providerRef).id, unclear: !parseRef(p.providerRef).transactionId }));
}

/** The daily job: checks every refund left pending for more than a minute. */
export async function reconcilePendingPayouts() {
  const d = await db();
  const rows = await d.select({ id: s.payouts.id }).from(s.payouts)
    .where(and(eq(s.payouts.status, "pending"), lt(s.payouts.at, new Date(Date.now() - 60e3).toISOString())));
  let settled = 0;
  for (const r of rows) if ((await reconcilePayout(r.id)) !== "pending") settled++;
  return { checked: rows.length, settled };
}
