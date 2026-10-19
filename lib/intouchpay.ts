// IntouchPay Rwanda collections, from the HTTP API guide linked on
// https://intouchpay.co.rw/http-api (static/files/http_intouchpay_api.pdf).
//
// RequestPayment  POST {base}/requestpayment/        application/x-www-form-urlencoded
// GetTransactionStatus  POST {base}/gettransactionstatus/   application/json
// Callback        POST our URL with JSON { jsonpayload: { ... } }, optionally HTTP Basic
//
// Password is SHA-256 hex of username + accountno + partnerpassword + timestamp (UTC yyyymmddhhmmss).
// The guide's parameter table names the phone field mobilephoneno; the request example sends mobilephone.
// This client sends the example's name. accountno is mandatory in the table and is part of the password,
// so it is sent on RequestPayment even though the example omits it.
//
// A callback is never proof of payment. It only identifies which prompt to ask GetTransactionStatus about.
import { createHash, timingSafeEqual } from "node:crypto";

export class IntouchRejected extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "IntouchRejected";
    this.code = code;
  }
}

/** Codes the guide lists as a refused RequestPayment (section 2.9), excluding pending, success and duplicate. */
const REFUSED = new Set([
  "0002", "0003", "0004", "0005", "0006", "0007", "0008",
  "2100", "2200", "2300", "2500", "2600", "2700",
  "1005", "1002", "1008", "1200", "1100", "1300",
]);

export const intouchTimestamp = (now = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
};

/** Guide section 2.4. The partner password never leaves this process. */
export const intouchPassword = (username: string, accountNo: string, partnerPassword: string, timestamp: string) =>
  createHash("sha256").update(`${username}${accountNo}${partnerPassword}${timestamp}`, "utf8").digest("hex");

export const intouchMsisdn = (phone9: string) => {
  if (!/^7\d{8}$/.test(phone9)) throw new IntouchRejected("1200", "IntouchPay requires a Rwandan mobile number.");
  return `250${phone9}`;
};

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const codeOf = (body: Record<string, unknown>) => (body.responsecode == null ? "" : String(body.responsecode).trim());

export type PayOutcome = "paid" | "pending" | "failed" | "missing";

/** Maps a RequestPayment or GetTransactionStatus body. Unknown shapes stay pending: they are not treated as paid or failed. */
export function paymentOutcome(body: Record<string, unknown>): PayOutcome {
  const code = codeOf(body);
  const st = body.status == null ? "" : String(body.status).trim().toLowerCase();
  const success = body.success;
  const denied = success === false || success === "false" || success === 0;
  if (code === "3000" || code === "3100" || code === "3200") return "missing";
  if (code === "2400") return "pending";
  // A documented refusal wins over a status word, so a failure code is never left pending.
  if (REFUSED.has(code) || st === "failed" || st === "failure" || st.startsWith("fail")) return "failed";
  // 01 is "Successful" for a payment (section 2.9 and 4.7). The guide spells the status "Successfull".
  // A body that says successful and also success:false is not treated as paid or failed.
  if (code === "01" || st === "successfull" || st === "successful") return denied ? "pending" : "paid";
  if (code === "1000" || st === "pending") return "pending";
  if (denied) return "failed";
  return "pending";
}

const txIdOk = (v: unknown) => {
  const id = v == null ? "" : String(v).trim();
  return /^[A-Za-z0-9]{1,40}$/.test(id) ? id : undefined;
};

export function requestDecision(body: Record<string, unknown>): { accepted: boolean; refused: boolean; transactionId?: string; code: string } {
  const outcome = paymentOutcome(body);
  const code = codeOf(body);
  const transactionId = txIdOk(body.transactionid);
  if (outcome === "paid" || outcome === "pending") return { accepted: true, refused: false, transactionId, code };
  if (outcome === "failed") return { accepted: false, refused: true, code };
  return { accepted: false, refused: false, code };
}

export type RefusalKind = "notRegistered" | "network" | "badNumber" | "amount" | "other";

/** Why IntouchPay refused a prompt, in terms the customer can act on. Anything else is "other": we could not send it. */
export function refusalKind(code: string): RefusalKind {
  if (code === "1002") return "notRegistered";
  if (code === "1100") return "network";
  if (code === "1200") return "badNumber";
  if (code === "2100" || code === "2200" || code === "2300") return "amount";
  return "other";
}

/** Guide section 2.7. The body is read as an identifier, and as a claim of "failed" that is acted on only when the
 *  callback was authenticated (lib/payment-callback.ts). It is never read as proof of payment. */
export function readIntouchCallback(body: unknown): { requestId: string; transactionId: string; responsecode: string; outcome: PayOutcome } | null {
  const root = asRecord(body);
  const payload = asRecord(root?.jsonpayload);
  if (!payload) return null;
  const requestId = txIdOk(payload.requesttransactionid);
  const transactionId = txIdOk(payload.transactionid);
  if (!requestId || !transactionId) return null;
  return { requestId, transactionId, responsecode: codeOf(payload), outcome: paymentOutcome(payload) };
}

export function parseIntouchRef(providerRef: string): { requestId: string; transactionId?: string } | null {
  const base = providerRef.split("|")[0] ?? "";
  const [key, requestId, transactionId] = base.split(":");
  if (key !== "intouch" || !requestId || !/^[A-Za-z0-9]{1,40}$/.test(requestId)) return null;
  if (transactionId && !/^[A-Za-z0-9]{1,40}$/.test(transactionId)) return null;
  return { requestId, transactionId: transactionId || undefined };
}

/** Binds IntouchPay's transaction id to a prompt that does not have one yet. A different id is never overwritten. */
export function withIntouchTransactionId(providerRef: string, transactionId: string, requestId: string): string | null {
  const parsed = parseIntouchRef(providerRef);
  if (!parsed || parsed.requestId !== requestId) return null;
  if (!/^[A-Za-z0-9]{1,40}$/.test(transactionId)) return null;
  if (parsed.transactionId) return parsed.transactionId === transactionId ? providerRef : null;
  return `intouch:${parsed.requestId}:${transactionId}`;
}

const same = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const callbackAuthConfigured = () => !!(process.env.INTOUCHPAY_CALLBACK_USER && process.env.INTOUCHPAY_CALLBACK_PASSWORD);

/** Guide section 2.7 shows the callback may use HTTP Basic. When both env values are set, the header must match. */
export function callbackAuthorized(authorization: string | null): boolean {
  const user = process.env.INTOUCHPAY_CALLBACK_USER ?? "";
  const password = process.env.INTOUCHPAY_CALLBACK_PASSWORD ?? "";
  if (!user || !password) return true;
  if (!authorization?.startsWith("Basic ")) return false;
  let decoded = "";
  try { decoded = Buffer.from(authorization.slice(6).trim(), "base64").toString("utf8"); } catch { return false; }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  return same(decoded.slice(0, i), user) && same(decoded.slice(i + 1), password);
}

function baseUrl() {
  const raw = (process.env.INTOUCHPAY_BASE_URL ?? "https://www.intouchpay.co.rw/api").replace(/\/$/, "");
  let url: URL;
  try { url = new URL(raw); } catch { throw new IntouchRejected("config", "INTOUCHPAY_BASE_URL is not a valid URL."); }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && process.env.NODE_ENV !== "production")) {
    throw new IntouchRejected("config", "INTOUCHPAY_BASE_URL must use HTTPS.");
  }
  return raw;
}

function credentials() {
  const username = process.env.INTOUCHPAY_USERNAME ?? "";
  const accountNo = process.env.INTOUCHPAY_ACCOUNT_NO ?? "";
  const partnerPassword = process.env.INTOUCHPAY_PARTNER_PASSWORD ?? "";
  if (!username || !accountNo || !partnerPassword) {
    throw new IntouchRejected("config", "IntouchPay credentials are not set.");
  }
  return { username, accountNo, partnerPassword };
}

async function post(url: string, init: { headers: Record<string, string>; body: string }, timeoutMs: number): Promise<Response> {
  return fetch(url, { method: "POST", headers: init.headers, body: init.body, signal: AbortSignal.timeout(timeoutMs) });
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return asRecord(parsed) ?? {};
  } catch {
    return {};
  }
}

/** The guide allows IntouchPay 60 seconds to answer. The pay page's maxDuration (60) must outlast this, so a slow answer
 *  leaves time to save what happened. An answer we gave up on is settled by the callback or the status check. */
const REQUEST_TIMEOUT_MS = 50_000;

/** Section 2. RequestPayment. Does not retry: a timeout may still have been accepted, and a second call would be a new attempt. */
export async function requestIntouchPayment(input: { requestId: string; phone9: string; amount: number; callbackUrl?: string }): Promise<{ transactionId?: string; code: string }> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new IntouchRejected("2100", "IntouchPay amount must be a positive number of francs.");
  const { username, accountNo, partnerPassword } = credentials();
  const timestamp = intouchTimestamp();
  const password = intouchPassword(username, accountNo, partnerPassword, timestamp);
  const form = new URLSearchParams({
    username,
    timestamp,
    amount: String(input.amount),
    password,
    mobilephone: intouchMsisdn(input.phone9),
    requesttransactionid: input.requestId,
    accountno: accountNo,
  });
  if (input.callbackUrl) form.set("callbackurl", input.callbackUrl);
  const url = `${baseUrl()}/requestpayment/`;
  let res: Response;
  try {
    res = await post(url, { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() }, REQUEST_TIMEOUT_MS);
  } catch (e) {
    console.error("[payments] IntouchPay requestpayment unreachable");
    throw e;
  }
  const body = await readBody(res);
  if (!res.ok) {
    console.error("[payments] IntouchPay requestpayment HTTP", res.status);
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      throw new IntouchRejected(String(res.status), `IntouchPay refused the prompt (HTTP ${res.status}).`);
    }
    throw new Error(`IntouchPay requestpayment HTTP ${res.status}`);
  }
  const decision = requestDecision(body);
  console.info("[payments] IntouchPay requestpayment", decision.code || "no-code");
  if (decision.refused) throw new IntouchRejected(decision.code, `IntouchPay refused the prompt (${decision.code || "no code"}).`);
  if (!decision.accepted) throw new Error(`IntouchPay requestpayment not accepted (${decision.code || "no code"}).`);
  return { transactionId: decision.transactionId, code: decision.code };
}

/** Section 4. One retry when the call fails or IntouchPay is unavailable. The body is the only source of paid/failed. */
export async function intouchPaymentStatus(requestId: string, transactionId: string | undefined): Promise<{ status: "paid" | "pending" | "failed"; reference?: string }> {
  if (!requestId || !transactionId) throw new Error("IntouchPay transaction id is not recorded yet.");
  const { username, accountNo, partnerPassword } = credentials();
  const ask = async () => {
    const timestamp = intouchTimestamp();
    const password = intouchPassword(username, accountNo, partnerPassword, timestamp);
    const res = await post(`${baseUrl()}/gettransactionstatus/`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, timestamp, password, requesttransactionid: requestId, transactionid: transactionId }),
    }, 20_000);
    const body = await readBody(res);
    if (!res.ok && res.status !== 200) {
      if (res.status >= 500 || res.status === 408 || res.status === 429) throw new Error(`IntouchPay status HTTP ${res.status}`);
      throw new IntouchRejected(String(res.status), `IntouchPay status HTTP ${res.status}`);
    }
    return body;
  };
  let body: Record<string, unknown>;
  try {
    body = await ask();
  } catch (e) {
    if (e instanceof IntouchRejected) throw e;
    await new Promise((r) => setTimeout(r, 1000));
    body = await ask();
  }
  const outcome = paymentOutcome(body);
  console.info("[payments] IntouchPay gettransactionstatus", codeOf(body) || "no-code");
  if (outcome === "missing") throw new Error(`IntouchPay has no record of this prompt (${codeOf(body) || "no code"}).`);
  const reference = txIdOk(body.referenceno);
  if (outcome === "failed") return { status: "failed", reference };
  if (outcome === "paid") return { status: "paid", reference };
  return { status: "pending", reference };
}
