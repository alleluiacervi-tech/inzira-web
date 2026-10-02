// Scheduled work, run by /api/cron (see vercel.json). Every task is safe to run twice.
import { and, eq, isNull, lt } from "drizzle-orm";
import { reconcileStalePayments } from "./billing";
import { db, iso, schema as s } from "./db";
import { rwf } from "./format";
import { event, notify } from "./mutate";
import { amountDue } from "./status";

/** Requests whose fees were sent, are past due and unpaid go on hold, with one SMS reminder. */
export async function holdOverduePayments() {
  const d = await db();
  const now = new Date().toISOString();
  const rows = await d.select().from(s.requests).where(and(isNull(s.requests.closed), isNull(s.requests.hold), lt(s.requests.dueAt, now)));
  let held = 0;
  for (const r of rows) {
    if (r.stage === "completed" || r.quote === "estimate") continue;
    const txs = await d.select().from(s.transactions).where(eq(s.transactions.ref, r.ref));
    const due = amountDue({
      invoice: r.invoice, official: r.official, officialMode: r.officialMode ?? undefined, officialLabel: r.officialLabel, ours: r.ours, oursStandard: r.oursStandard,
      quote: r.quote, officialReceipt: r.officialReceipt, transactions: txs.map((t) => ({ receipt: t.receipt, at: iso(t.at)!, method: t.method, official: t.official, ours: t.ours, status: t.status })),
    });
    if (due <= 0 || txs.some((t) => t.status === "pending")) continue;
    await d.transaction(async (tx) => {
      await tx.update(s.requests).set({ hold: { reason: "payment", title: `Payment of ${rwf(due)} is overdue`, detail: "Everything else is ready. We carry on as soon as it is paid.", since: now } }).where(eq(s.requests.ref, r.ref));
      await event(tx, r.ref, "Payment reminder sent", "system", `${rwf(due)} overdue`);
      await notify(tx, r.ref, { icon: "card", title: `Payment of ${rwf(due)} is overdue for ${r.ref}`, sms: `payment of ${rwf(due)} is overdue. Pay in your portal and we carry on straight away.` });
    });
    held++;
  }
  return { held };
}

/** Removes expired sign-in codes, sessions and old rate-limit counters. */
export async function cleanUp() {
  const d = await db();
  const now = new Date().toISOString();
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  await d.delete(s.otpCodes).where(lt(s.otpCodes.expiresAt, now));
  await d.delete(s.sessions).where(lt(s.sessions.expiresAt, now));
  await d.delete(s.rateLimits).where(lt(s.rateLimits.windowStart, dayAgo));
  return { ok: true };
}

export async function runAll() {
  return {
    payments: await reconcileStalePayments(),
    overdue: await holdOverduePayments(),
    cleanUp: await cleanUp(),
  };
}
