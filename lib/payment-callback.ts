// Provider callbacks. The body never decides paid: it only tells us which prompt to re-check with the provider
// (lib/billing.ts). An authenticated IntouchPay callback that names the prompt and says it failed may close it early.
// IntouchPay posts { jsonpayload } (API guide section 2.7) and must always get HTTP 200 with message, success and
// request_id back: the reply acknowledges receipt only. Whether the callback matched a payment, carried a login or was
// acted on never changes it, or IntouchPay records the callback as failed.
import { and, eq, like, or } from "drizzle-orm";
import { reconcilePayment } from "./billing";
import { db, schema as s } from "./db";
import { callbackAuthConfigured, callbackAuthorized, callbackRequestId, parseIntouchRef, readIntouchCallback, withIntouchTransactionId } from "./intouchpay";
import { allow } from "./ratelimit";

export type CallbackInput = { txId: number | null; body: unknown; authorization: string | null };

/** The reply to every callback, whatever it contained. */
export function acknowledgeCallback(body: unknown): Response {
  return Response.json({ message: "success", success: true, request_id: callbackRequestId(body) }, { status: 200 });
}

/** A callback body as IntouchPay may send it: JSON, a form field `jsonpayload`, or `jsonpayload` as a JSON string. */
export function parseCallbackBody(text: string): unknown {
  const parse = (t: string): unknown => { try { return JSON.parse(t); } catch { return null; } };
  let body = parse(text);
  if (body === null && text.includes("jsonpayload=")) body = { jsonpayload: new URLSearchParams(text).get("jsonpayload") ?? "" };
  const inner = (body as { jsonpayload?: unknown } | null)?.jsonpayload;
  if (typeof inner === "string") body = { ...(body as object), jsonpayload: parse(inner) };
  return body;
}

/** Finds the prompt a callback is about and asks the provider how it stands. Never throws on a bad body. */
export async function processPaymentCallback(input: CallbackInput): Promise<void> {
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
  if (!txId) return;
  // Each callback can cost a status call to the provider. Over the limit it is still acknowledged; the payment
  // screen and the scheduled job check the payment anyway.
  if (!(await allow(`callback:tx:${txId}`, 12, 60e3))) return;
  const [t] = await d.select().from(s.transactions).where(eq(s.transactions.id, txId));
  if (!t) return;
  if (t.providerRef && callback) {
    const next = withIntouchTransactionId(t.providerRef, callback.transactionId, callback.requestId);
    if (next && next !== t.providerRef) {
      await d.update(s.transactions).set({ providerRef: next }).where(and(eq(s.transactions.id, t.id), eq(s.transactions.status, "pending")));
    }
  }
  // A decline is believed only from a callback that proved who it is (HTTP Basic) and names this very prompt.
  // Without the login, a callback is only a reason to ask the provider.
  const authenticated = callbackAuthConfigured() && callbackAuthorized(input.authorization);
  const declined = authenticated && callback?.outcome === "failed" && !!t.providerRef && parseIntouchRef(t.providerRef)?.requestId === callback.requestId;
  await reconcilePayment(t.id, { late: true, declined });
}

/** Processes the callback, then acknowledges it. The route acknowledges first and processes after the reply. */
export async function handlePaymentCallback(input: CallbackInput): Promise<Response> {
  await processPaymentCallback(input);
  return acknowledgeCallback(input.body);
}
