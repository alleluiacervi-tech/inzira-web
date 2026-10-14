import { eq, like } from "drizzle-orm";
import { reconcilePayment } from "@/lib/billing";
import { db, schema as s } from "@/lib/db";
import { allow, clientIp } from "@/lib/ratelimit";

// Mobile money providers call this when a prompt is approved or declined. The body is never
// trusted: it only tells us WHICH payment to re-check, and the outcome comes from asking the
// provider directly (lib/billing.ts). MTN calls the URL we pass with each prompt (?tx=<id>);
// Airtel posts its transaction id, which we match to the prompt we sent.
async function handle(req: Request) {
  // Each call can cost a request to the provider, so a flood from one address, or about one payment, is turned away.
  // Providers retry on a 429 later.
  if (!(await allow(`callback:ip:${await clientIp()}`, 120, 60e3))) return Response.json({ received: false }, { status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > 16_384) return Response.json({ received: false }, { status: 413 });
  const url = new URL(req.url);
  let txId = Number(url.searchParams.get("tx")) || null;
  if (!txId) {
    const body = (await req.json().catch(() => null)) as { transaction?: { id?: string } } | null;
    const airtelId = body?.transaction?.id;
    if (airtelId && /^[a-zA-Z0-9]+$/.test(airtelId)) {
      const [t] = await (await db()).select({ id: s.transactions.id }).from(s.transactions).where(like(s.transactions.providerRef, `airtel:${airtelId}%`));
      txId = t?.id ?? null;
    }
  }
  if (txId && !(await allow(`callback:tx:${txId}`, 12, 60e3))) return Response.json({ received: false }, { status: 429 });
  if (txId) {
    const [t] = await (await db()).select({ id: s.transactions.id }).from(s.transactions).where(eq(s.transactions.id, txId));
    if (t) await reconcilePayment(t.id);
  }
  // Always 200: providers retry on errors, and an unknown id is not something they can fix.
  return Response.json({ received: true });
}

export const POST = handle;
export const PUT = handle;
