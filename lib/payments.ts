// Mobile money collection. Choose a provider with PAYMENT_PROVIDER.
// - "simulator" (default outside production, or with INZIRA_DEMO=1): no money moves. The prompt is
//   "approved" two seconds after it is sent; a number ending in 0000 is "declined".
// - Real providers (MTN MoMo Collection API, Airtel Money) are added here once Inzira has API
//   credentials: implement requestToPay and status for them; nothing else in the app changes.
import { isDemo } from "./sms";

export type PayStatus = "pending" | "paid" | "failed";
type Provider = {
  method: "MTN MoMo" | "Airtel Money";
  requestToPay(input: { phone9: string; amount: number; reference: string }): Promise<{ providerRef: string }>;
  status(providerRef: string): Promise<PayStatus>;
};

const simulator: Provider = {
  method: "MTN MoMo",
  async requestToPay({ phone9 }) {
    return { providerRef: `sim:${Date.now()}:${phone9}` };
  },
  async status(providerRef) {
    const [, at, phone] = providerRef.split(":");
    if (Date.now() - Number(at) < 2000) return "pending";
    return phone.endsWith("0000") ? "failed" : "paid";
  },
};

export function paymentProvider(): Provider {
  const name = process.env.PAYMENT_PROVIDER ?? (isDemo() ? "simulator" : "");
  if (name === "simulator") return simulator;
  throw new Error("Payments are not configured. Set PAYMENT_PROVIDER (see README).");
}
/** Airtel numbers start 72/73; everything else here is treated as MTN. */
export const methodFor = (phone9: string): "MTN MoMo" | "Airtel Money" => (/^7[23]/.test(phone9) ? "Airtel Money" : "MTN MoMo");
