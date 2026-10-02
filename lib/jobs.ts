// Scheduled work, run by /api/cron (see vercel.json). Every task is safe to run twice.
import { and, eq, isNull, lt } from "drizzle-orm";
import { retentionSweep } from "./privacy";
import { allow } from "./ratelimit";
import { sendSms } from "./sms";
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

/** Kigali's calendar date (UTC+2, no daylight saving), e.g. "2026-10-02". */
const kigaliDate = (t = Date.now()) => new Date(t + 2 * 3600e3).toISOString().slice(0, 10);

/**
 * One SMS a day to each member of staff with something waiting: their follow-ups due today or earlier,
 * and their cases waiting on the customer for more than three days. Supervisors and above also hear how
 * many new requests have no agent yet. Sent at most once a day, however often the job runs.
 */
export async function staffDigest() {
  const today = kigaliDate();
  const d = await db();
  const people = (await d.select().from(s.staff).where(eq(s.staff.active, true))).filter((p) => p.phone);
  const open = (await d.select({ agentId: s.requests.agentId, followUp: s.requests.followUp, hold: s.requests.hold, stage: s.requests.stage, closed: s.requests.closed }).from(s.requests))
    .filter((r) => !r.closed && r.stage !== "completed");
  const endOfToday = Date.parse(`${today}T23:59:59+02:00`);
  const threeDaysAgo = Date.now() - 3 * 864e5;
  const unassigned = open.filter((r) => !r.agentId).length;
  let sent = 0;
  for (const p of people) {
    const mine = open.filter((r) => r.agentId === p.id);
    const followUps = mine.filter((r) => r.followUp && Date.parse(r.followUp.at) <= endOfToday).length;
    const waiting = mine.filter((r) => r.hold && Date.parse(r.hold.since) < threeDaysAgo).length;
    const lead = p.role === "Owner" || p.role === "Administrator" || p.role === "Supervisor";
    const parts = [
      followUps && `${followUps} follow-up${followUps === 1 ? "" : "s"} due`,
      waiting && `${waiting} case${waiting === 1 ? "" : "s"} waiting on the customer for over 3 days`,
      lead && unassigned && `${unassigned} new request${unassigned === 1 ? "" : "s"} with no agent`,
    ].filter(Boolean);
    if (!parts.length) continue;
    // The guard key is per person and day, so a second run the same day sends nothing.
    if (!(await allow(`digest:${p.id}:${today}`, 1, 864e5))) continue;
    try {
      await sendSms(p.phone!, `Inzira today: ${parts.join(", ")}. Open the staff console to see them.`);
      sent++;
    } catch (e) { console.error("[digest]", p.id, e); }
  }
  return { sent };
}

export async function runAll() {
  return {
    payments: await reconcileStalePayments(),
    overdue: await holdOverduePayments(),
    retention: await retentionSweep(),
    digest: await staffDigest(),
    cleanUp: await cleanUp(),
  };
}

/** Runs every task and records the run, so the admin console can show when the job last worked. */
export async function runAndRecord() {
  const started = Date.now();
  let ok = true;
  let result: Record<string, unknown>;
  try { result = await runAll(); } catch (e) { ok = false; result = { error: e instanceof Error ? e.message : String(e) }; console.error("[cron]", e); }
  await (await db()).insert(s.jobRuns).values({ ok, result, ms: Date.now() - started }).catch((e) => console.error("[cron] could not record run", e));
  return { ok, ...result };
}
