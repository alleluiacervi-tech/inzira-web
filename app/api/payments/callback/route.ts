import { eq, like } from "drizzle-orm";
import { reconcilePayment } from "@/lib/billing";
import { db, schema as s } from "@/lib/db";

// Mobile money providers call this when a prompt is approved or declined. The body is never
// trusted: it only tells us WHICH payment to re-check, and the outcome comes from asking the
// provider directly (lib/billing.ts). MTN calls the URL we pass with each prompt (?tx=<id>);
// Airtel posts its transaction id, which we match to the prompt we sent.
async function handle(req: Request) {
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
  if (txId) {
    const [t] = await (await db()).select({ id: s.transactions.id }).from(s.transactions).where(eq(s.transactions.id, txId));
    if (t) await reconcilePayment(t.id);
  }
  // Always 200: providers retry on errors, and an unknown id is not something they can fix.
  return Response.json({ received: true });
}

export const POST = handle;
export const PUT = handle;
