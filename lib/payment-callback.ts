// Provider callbacks. The body never decides paid: it only tells us which prompt to re-check with the provider
// (lib/billing.ts). An authenticated IntouchPay callback that names the prompt and says it failed may close it early. IntouchPay posts { jsonpayload } (API guide section 2.7)
// and expects HTTP 200 with message, success and request_id.
import { and, eq, like, or } from "drizzle-orm";
import { reconcilePayment } from "./billing";
import { db, schema as s } from "./db";
import { callbackAuthConfigured, callbackAuthorized, parseIntouchRef, readIntouchCallback, withIntouchTransactionId } from "./intouchpay";
import { allow } from "./ratelimit";

const json = (status: number, body: { message: string; success: boolean; request_id: string; received?: boolean }) =>
  Response.json(body, { status });

export async function handlePaymentCallback(input: { txId: number | null; body: unknown; authorization: string | null }): Promise<Response> {
  if (callbackAuthConfigured() && !callbackAuthorized(input.authorization)) {
    return json(401, { message: "unauthorized", success: false, request_id: "" });
  }
  const callback = readIntouchCallback(input.body);
  const d = await db();
  let txId = input.txId;
  if (!txId && callback) {
    const [t] = await d.select({ id: s.transactions.id }).from(s.transactions)
      // The whole request id, so a short id from a callback cannot match the start of another prompt's id.
      .where(or(eq(s.transactions.providerRef, `intouch:${callback.requestId}`), like(s.transactions.providerRef, `intouch:${callback.requestId}:%`), like(s.transactions.providerRef, `intouch:${callback.requestId}|%`)));
    txId = t?.id ?? null;
  }
  if (!txId) {
    const airtel = (input.body as { transaction?: { id?: string } } | null)?.transaction?.id;
    if (airtel && /^[a-zA-Z0-9]+$/.test(airtel)) {
      const [t] = await d.select({ id: s.transactions.id }).from(s.transactions).where(like(s.transactions.providerRef, `airtel:${airtel}%`));
      txId = t?.id ?? null;
    }
  }
  if (txId && !(await allow(`callback:tx:${txId}`, 12, 60e3))) {
    return json(429, { message: "busy", success: false, request_id: callback?.requestId ?? "", received: false });
  }
  if (txId) {
    const [t] = await d.select().from(s.transactions).where(eq(s.transactions.id, txId));
    if (t?.providerRef && callback) {
      const next = withIntouchTransactionId(t.providerRef, callback.transactionId, callback.requestId);
      if (next && next !== t.providerRef) {
        await d.update(s.transactions).set({ providerRef: next }).where(and(eq(s.transactions.id, t.id), eq(s.transactions.status, "pending")));
      }
    }
    // A decline is believed only from a callback that proved who it is (HTTP Basic) and names this very prompt.
    const declined = callbackAuthConfigured() && callback?.outcome === "failed" && !!t?.providerRef && parseIntouchRef(t.providerRef)?.requestId === callback.requestId;
    if (t) await reconcilePayment(t.id, { late: true, declined });
  }
  return json(200, { message: "success", success: true, request_id: callback?.requestId ?? (txId ? String(txId) : ""), received: true });
}
