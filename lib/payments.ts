// Mobile money collection. PAYMENT_PROVIDER chooses how prompts are sent:
// - "live" or "intouchpay": IntouchPay Rwanda (one API for MTN and Airtel). See lib/intouchpay.ts.
// - "direct": the MTN MoMo and Airtel Money APIs, kept for an account that already has those keys.
//   Airtel numbers are 072/073; every other Rwandan mobile is treated as MTN.
// - "simulator" (default outside production, or with INZIRA_DEMO=1): no money moves. The prompt is
//   "approved" two seconds after it is sent; a number ending in 0000 is "declined", and one ending in 1111 is approved
//   after twelve seconds (time to leave the payment screen and come back to it).
// The provider is remembered in each transaction's providerRef ("intouch:…", "mtn:…", "airtel:…", "sim:…"),
// so status checks always go back to the provider that sent the prompt.
import { randomInt, randomUUID } from "node:crypto";
import { IntouchRejected, intouchPaymentStatus, requestIntouchPayment } from "./intouchpay";
import { isDemo } from "./sms";

export type PayStatus = "pending" | "paid" | "failed";
type Method = "MTN MoMo" | "Airtel Money";
type Provider = {
  key: "sim" | "mtn" | "airtel" | "intouch";
  /** Our own id for the prompt, made before the call and saved with the payment first (see newPrompt). */
  newId(phone9: string): string;
  requestToPay(input: { id: string; phone9: string; amount: number; reference: string; callbackUrl?: string }): Promise<{ providerTxId?: string }>;
  status(id: string): Promise<{ status: PayStatus; providerTxId?: string }>;
};

/** Airtel Rwanda numbers start 072/073; everything else is treated as MTN. */
export const methodFor = (phone9: string): Method => (/^7[23]/.test(phone9) ? "Airtel Money" : "MTN MoMo");

// ---------------- simulator ----------------
const simulator: Provider = {
  key: "sim",
  newId: (phone9) => `${Date.now()}:${phone9}`,
  async requestToPay() { return {}; },
  async status(id) {
    const [at, phone] = id.split(":");
    if (Date.now() - Number(at) < (phone.endsWith("1111") ? 12_000 : 2000)) return { status: "pending" };
    return { status: phone.endsWith("0000") ? "failed" : "paid" };
  },
};

// ---------------- MTN MoMo (Collection API) ----------------
const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};
const tokens = new Map<string, { value: string; expires: number }>();
async function cachedToken(key: string, fetchToken: () => Promise<{ access_token: string; expires_in: number | string }>) {
  const hit = tokens.get(key);
  if (hit && hit.expires > Date.now() + 30e3) return hit.value;
  const t = await fetchToken();
  tokens.set(key, { value: t.access_token, expires: Date.now() + Number(t.expires_in) * 1000 });
  return t.access_token;
}

const mtnBase = () => process.env.MTN_MOMO_BASE_URL ?? "https://sandbox.momodeveloper.mtn.com";
const mtnToken = () => cachedToken("mtn", async () => {
  const res = await fetch(`${mtnBase()}/collection/token/`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${env("MTN_MOMO_API_USER")}:${env("MTN_MOMO_API_KEY")}`).toString("base64")}`, "Ocp-Apim-Subscription-Key": env("MTN_MOMO_SUBSCRIPTION_KEY") },
  });
  if (!res.ok) throw new Error(`MTN token: ${res.status}`);
  return res.json();
});

/** The provider answered and said no (a 4xx): the prompt does not exist, so the customer can try again at once.
 *  Anything else (a timeout, a 5xx, a dropped connection) leaves it unknown, and the status check decides. */
export class PromptRefused extends Error {
  /** The provider's own reason code, when it gave one (IntouchPay's response codes). */
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}
const refusedIf4xx = (status: number, what: string, detail = "") => {
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) throw new PromptRefused(`${what}: ${status} ${detail}`.trim());
  throw new Error(`${what}: ${status} ${detail}`.trim());
};

const mtn: Provider = {
  key: "mtn",
  newId: () => randomUUID(),
  async requestToPay({ id, phone9, amount, reference, callbackUrl }) {
    const base = mtnBase();
    const subKey = env("MTN_MOMO_SUBSCRIPTION_KEY");
    const token = await mtnToken();
    const res = await fetch(`${base}/collection/v1_0/requesttopay`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`, "X-Reference-Id": id, "X-Target-Environment": process.env.MTN_MOMO_ENVIRONMENT ?? "sandbox",
        "Ocp-Apim-Subscription-Key": subKey, "Content-Type": "application/json", ...(callbackUrl ? { "X-Callback-Url": callbackUrl } : {}),
      },
      body: JSON.stringify({
        amount: String(amount), currency: process.env.MTN_MOMO_CURRENCY ?? "RWF", externalId: reference,
        payer: { partyIdType: "MSISDN", partyId: `250${phone9}` }, payerMessage: `Inzira ${reference}`, payeeNote: reference,
      }),
    });
    // 409 means this id was already accepted (a retry of the same call): the prompt exists.
    if (res.status !== 202 && res.status !== 409) refusedIf4xx(res.status, "MTN requesttopay", await res.text());
    return {};
  },
  async status(id) {
    const token = await mtnToken();
    const res = await fetch(`${mtnBase()}/collection/v1_0/requesttopay/${id}`, {
      headers: { Authorization: `Bearer ${token}`, "X-Target-Environment": process.env.MTN_MOMO_ENVIRONMENT ?? "sandbox", "Ocp-Apim-Subscription-Key": env("MTN_MOMO_SUBSCRIPTION_KEY") },
    });
    if (res.status === 401) { tokens.delete("mtn"); return { status: "pending" }; }
    if (!res.ok) throw new Error(`MTN status: ${res.status}`);
    const body = (await res.json()) as { status?: string; financialTransactionId?: string };
    return { status: body.status === "SUCCESSFUL" ? "paid" : body.status === "FAILED" || body.status === "REJECTED" || body.status === "TIMEOUT" ? "failed" : "pending", providerTxId: body.financialTransactionId };
  },
};

// ---------------- Airtel Money (Collections API) ----------------
const airtelBase = () => process.env.AIRTEL_BASE_URL ?? "https://openapiuat.airtel.africa";
const airtelToken = () => cachedToken("airtel", async () => {
  const res = await fetch(`${airtelBase()}/auth/oauth2/token`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "*/*" },
    body: JSON.stringify({ client_id: env("AIRTEL_CLIENT_ID"), client_secret: env("AIRTEL_CLIENT_SECRET"), grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Airtel token: ${res.status}`);
  return res.json();
});
const airtelHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "*/*", "X-Country": "RW", "X-Currency": "RWF" });

const airtel: Provider = {
  key: "airtel",
  newId: () => randomUUID().replace(/-/g, "").slice(0, 20),
  async requestToPay({ id, phone9, amount, reference }) {
    const res = await fetch(`${airtelBase()}/merchant/v1/payments/`, {
      method: "POST", headers: airtelHeaders(await airtelToken()),
      body: JSON.stringify({ reference, subscriber: { country: "RW", currency: "RWF", msisdn: phone9 }, transaction: { amount, country: "RW", currency: "RWF", id } }),
    });
    if (!res.ok) refusedIf4xx(res.status, "Airtel payment", await res.text());
    return {};
  },
  async status(id) {
    const res = await fetch(`${airtelBase()}/standard/v1/payments/${id}`, { headers: airtelHeaders(await airtelToken()) });
    if (!res.ok) throw new Error(`Airtel status: ${res.status}`);
    const body = (await res.json()) as { data?: { transaction?: { status?: string; airtel_money_id?: string } } };
    const st = body.data?.transaction?.status;
    return { status: st === "TS" ? "paid" : st === "TF" || st === "TE" ? "failed" : "pending", providerTxId: body.data?.transaction?.airtel_money_id };
  },
};

// ---------------- IntouchPay (live collections) ----------------
/** The guide's request ids are all digits (34555, 4522233), so ours are too: the millisecond clock then three random
 *  digits, 16 digits in all. That stays an exact integer even if IntouchPay reads it as a number, and two prompts
 *  in the same millisecond still differ. Longer-lived hex ids from earlier prompts are still understood. */
export const newIntouchRequestId = () => `${Date.now()}${String(randomInt(1000)).padStart(3, "0")}`;

const intouch: Provider = {
  key: "intouch",
  newId: newIntouchRequestId,
  async requestToPay({ id, phone9, amount, callbackUrl }) {
    try {
      const sent = await requestIntouchPayment({ requestId: id, phone9, amount, callbackUrl });
      return { providerTxId: sent.transactionId };
    } catch (e) {
      if (e instanceof IntouchRejected) throw new PromptRefused(e.message, e.code);
      throw e;
    }
  },
  async status(id) {
    const [requestId, transactionId] = id.split(":");
    try {
      const result = await intouchPaymentStatus(requestId, transactionId);
      return { status: result.status, providerTxId: result.reference };
    } catch (e) {
      if (e instanceof IntouchRejected) throw new PromptRefused(e.message);
      throw e;
    }
  },
};

// ---------------- choosing ----------------
const mode = () => process.env.PAYMENT_PROVIDER ?? (isDemo() ? "simulator" : "");

/** The provider that will send a prompt to this number. Throws if payments are not configured.
 *  `sampleDesk` is a reserved test account (example.com / .test) on a site with no payment provider:
 *  the simulator runs for that account only, so a real customer is never marked paid without IntouchPay. */
export function providerFor(phone9: string, sampleDesk = false): Provider {
  const selected = mode();
  if (selected === "simulator" || (!selected && sampleDesk)) {
    if (selected === "simulator" && !isDemo()) throw new Error("The payment simulator only runs in development or with INZIRA_DEMO=1.");
    return simulator;
  }
  if (selected === "live" || selected === "intouchpay") return intouch;
  if (selected === "direct") return methodFor(phone9) === "Airtel Money" ? airtel : mtn;
  throw new Error("Payments are not configured. Set PAYMENT_PROVIDER=live for IntouchPay, or simulator for demos.");
}

/** Picks the provider for this number and makes the prompt's id and reference up front, so they can be saved before the
 *  provider is called: a call that times out after the provider accepted it is still found and settled later. */
export function newPrompt(phone9: string, sampleDesk = false) {
  const provider = providerFor(phone9, sampleDesk);
  const id = provider.newId(phone9);
  return { provider, id, providerRef: `${provider.key}:${id}` };
}

/** Asks whichever provider created `providerRef` for the current status. */
export async function providerStatus(providerRef: string): Promise<{ status: PayStatus; providerTxId?: string }> {
  const [key, ...rest] = providerRef.split(":");
  const id = rest.join(":");
  if (key === "sim") return simulator.status(id);
  if (key === "mtn") return mtn.status(id);
  if (key === "airtel") return airtel.status(id);
  if (key === "intouch") return intouch.status(id.split("|")[0] ?? id);
  return { status: "failed" };
}

/** A prompt nobody approved within this time is treated as failed. */
export const PROMPT_TTL_MS = 15 * 60e3;
