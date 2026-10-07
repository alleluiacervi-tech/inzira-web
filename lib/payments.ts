// Mobile money collection. PAYMENT_PROVIDER chooses how prompts are sent:
// - "live": real money. MTN numbers go to the MTN MoMo Collection API, Airtel numbers (072/073)
//   to the Airtel Money Collections API. Written from the providers' published API documentation;
//   run it against each provider's sandbox before taking real payments.
// - "simulator" (default outside production, or with INZIRA_DEMO=1): no money moves. The prompt is
//   "approved" two seconds after it is sent; a number ending in 0000 is "declined".
// The provider is remembered in each transaction's providerRef ("mtn:…", "airtel:…", "sim:…"), so
// status checks always go back to the provider that sent the prompt.
import { randomUUID } from "node:crypto";
import { isDemo } from "./sms";

export type PayStatus = "pending" | "paid" | "failed";
type Method = "MTN MoMo" | "Airtel Money";
type Provider = {
  key: "sim" | "mtn" | "airtel";
  requestToPay(input: { phone9: string; amount: number; reference: string; callbackUrl?: string }): Promise<{ providerRef: string }>;
  status(id: string): Promise<{ status: PayStatus; providerTxId?: string }>;
};

/** Airtel Rwanda numbers start 072/073; everything else is treated as MTN. */
export const methodFor = (phone9: string): Method => (/^7[23]/.test(phone9) ? "Airtel Money" : "MTN MoMo");

// ---------------- simulator ----------------
const simulator: Provider = {
  key: "sim",
  async requestToPay({ phone9 }) {
    return { providerRef: `sim:${Date.now()}:${phone9}` };
  },
  async status(id) {
    const [at, phone] = id.split(":");
    if (Date.now() - Number(at) < 2000) return { status: "pending" };
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

const mtn: Provider = {
  key: "mtn",
  async requestToPay({ phone9, amount, reference, callbackUrl }) {
    const base = mtnBase();
    const subKey = env("MTN_MOMO_SUBSCRIPTION_KEY");
    const token = await mtnToken();
    const id = randomUUID();
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
    if (res.status !== 202) throw new Error(`MTN requesttopay: ${res.status} ${await res.text()}`);
    return { providerRef: `mtn:${id}` };
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
  async requestToPay({ phone9, amount, reference }) {
    const id = randomUUID().replace(/-/g, "").slice(0, 20);
    const res = await fetch(`${airtelBase()}/merchant/v1/payments/`, {
      method: "POST", headers: airtelHeaders(await airtelToken()),
      body: JSON.stringify({ reference, subscriber: { country: "RW", currency: "RWF", msisdn: phone9 }, transaction: { amount, country: "RW", currency: "RWF", id } }),
    });
    if (!res.ok) throw new Error(`Airtel payment: ${res.status} ${await res.text()}`);
    return { providerRef: `airtel:${id}` };
  },
  async status(id) {
    const res = await fetch(`${airtelBase()}/standard/v1/payments/${id}`, { headers: airtelHeaders(await airtelToken()) });
    if (!res.ok) throw new Error(`Airtel status: ${res.status}`);
    const body = (await res.json()) as { data?: { transaction?: { status?: string; airtel_money_id?: string } } };
    const st = body.data?.transaction?.status;
    return { status: st === "TS" ? "paid" : st === "TF" || st === "TE" ? "failed" : "pending", providerTxId: body.data?.transaction?.airtel_money_id };
  },
};

// ---------------- choosing ----------------
const mode = () => process.env.PAYMENT_PROVIDER ?? (isDemo() ? "simulator" : "");

/** The provider that will send a prompt to this number. Throws if payments are not configured. */
export function providerFor(phone9: string): Provider {
  if (mode() === "simulator") {
    if (!isDemo()) throw new Error("The payment simulator only runs in development or with INZIRA_DEMO=1.");
    return simulator;
  }
  if (mode() === "live") return methodFor(phone9) === "Airtel Money" ? airtel : mtn;
  throw new Error("Payments are not configured. Set PAYMENT_PROVIDER (see README).");
}

/** Asks whichever provider created `providerRef` for the current status.
 *  An empty ref means the prompt is still being sent, so it stays pending until the
 *  caller gives up. Marking it failed here would cancel a payment the provider already took. */
export async function providerStatus(providerRef: string): Promise<{ status: PayStatus; providerTxId?: string }> {
  if (!providerRef) return { status: "pending" };
  const [key, ...rest] = providerRef.split(":");
  const id = rest.join(":");
  if (key === "sim") return simulator.status(id);
  if (key === "mtn") return mtn.status(id);
  if (key === "airtel") return airtel.status(id);
  return { status: "failed" };
}

/** A prompt nobody approved within this time is treated as failed. */
export const PROMPT_TTL_MS = 15 * 60e3;
