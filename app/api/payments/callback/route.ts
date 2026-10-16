import { handlePaymentCallback } from "@/lib/payment-callback";
import { allow, clientIp } from "@/lib/ratelimit";

// Mobile money providers call this when a prompt is approved or declined. The body is never
// trusted: it only tells us WHICH payment to re-check, and the outcome comes from asking the
// provider directly (lib/billing.ts). IntouchPay posts { jsonpayload } and may send HTTP Basic
// (API guide section 2.7). MTN calls the URL we pass with each prompt (?tx=<id>); Airtel posts
// its transaction id, which we match to the prompt we sent.
async function handle(req: Request) {
  // Each call can cost a request to the provider, so a flood from one address, or about one payment, is turned away.
  // Providers retry on a 429 later.
  if (!(await allow(`callback:ip:${await clientIp()}`, 120, 60e3))) {
    return Response.json({ message: "busy", success: false, request_id: "", received: false }, { status: 429 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > 16_384) {
    return Response.json({ message: "too large", success: false, request_id: "" }, { status: 413 });
  }
  const url = new URL(req.url);
  const body = await req.json().catch(() => null);
  return handlePaymentCallback({
    txId: Number(url.searchParams.get("tx")) || null,
    body,
    authorization: req.headers.get("authorization"),
  });
}

export const POST = handle;
export const PUT = handle;
