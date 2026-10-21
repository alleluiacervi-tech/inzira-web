import { after } from "next/server";
import { acknowledgeCallback, parseCallbackBody, processPaymentCallback } from "@/lib/payment-callback";
import { allow, clientIp } from "@/lib/ratelimit";

// Mobile money providers call this when a prompt is approved or declined. The body is never
// trusted: it only tells us WHICH payment to re-check, and the outcome comes from asking the
// provider directly (lib/billing.ts). IntouchPay posts { jsonpayload } (API guide section 2.7).
// MTN calls the URL we pass with each prompt (?tx=<id>); Airtel posts its transaction id, which
// we match to the prompt we sent.
// IntouchPay must always get 200 { message: "success", success: true, request_id } straight away,
// or it records the callback as failed. So the reply comes first, and the re-check with the
// provider (which can take a while, lib/intouchpay.ts) runs after it.
export const maxDuration = 60;

const MAX_BODY = 16_384;

async function handle(req: Request) {
  const text = Number(req.headers.get("content-length") ?? 0) > MAX_BODY ? "" : (await req.text().catch(() => "")).slice(0, MAX_BODY);
  const body = parseCallbackBody(text);
  const input = { txId: Number(new URL(req.url).searchParams.get("tx")) || null, body, authorization: req.headers.get("authorization") };
  // A flood from one address is acknowledged like anything else, but not acted on. If the limit can't be read (the
  // database is down), the reply still goes out and the work is attempted.
  if (await allow(`callback:ip:${await clientIp()}`, 120, 60e3).catch(() => true)) {
    after(() => processPaymentCallback(input).catch((e) => console.error("[payments] callback", e)));
  }
  return acknowledgeCallback(body);
}

export const POST = handle;
export const PUT = handle;
