import { desc, eq, sql } from "drizzle-orm";
import { db, schema as s } from "./db";
import { CASE_RETENTION_DAYS } from "./case-retention";

/** Minimized operational evidence. This is active-store cleanup, not backup or legal certification. */
export async function getPrivacyOverview(now: string) {
  const d = await db();
  const [totals] = await d.select({
    archived: sql<number>`count(*) filter (where ${s.requests.privacyPurgedAt} is not null)::int`,
    waiting: sql<number>`count(*) filter (where ${s.requests.stage} = 'completed' and ${s.requests.privacyPurgedAt} is null)::int`,
    held: sql<number>`count(*) filter (where ${s.requests.stage} = 'completed' and ${s.requests.privacyPurgedAt} is null and ${s.requests.privacyHoldUntil} > ${now}::timestamptz)::int`,
    retrying: sql<number>`count(*) filter (where ${s.requests.privacyStartedAt} is not null and ${s.requests.privacyPurgedAt} is null)::int`,
    overdue: sql<number>`count(*) filter (where ${s.requests.stage} = 'completed' and ${s.requests.privacyPurgedAt} is null and (${s.requests.privacyHoldUntil} is null or ${s.requests.privacyHoldUntil} <= ${now}::timestamptz) and (${s.requests.stageDates}->>'completed')::timestamptz <= ${new Date(Date.parse(now) - CASE_RETENTION_DAYS * 864e5).toISOString()}::timestamptz)::int`,
    completed: sql<number>`count(*) filter (where ${s.requests.stage} = 'completed')::int`,
    total: sql<number>`count(*) filter (where ${s.requests.checkout} <> 'open')::int`,
  }).from(s.requests);
  const [job] = await d.select({ at: s.jobRuns.at, result: s.jobRuns.result }).from(s.jobRuns)
    .where(sql`${s.jobRuns.result} ? 'retention'`).orderBy(desc(s.jobRuns.at)).limit(1);
  const retention = job?.result.retention as { error?: string } | undefined;
  const lastRunAt = job?.at ?? null;
  const healthy = !!lastRunAt && Date.parse(now) - Date.parse(lastRunAt) <= 36 * 36e5 && !retention?.error && totals.overdue === 0 && totals.retrying === 0;
  const rows = await d.select({
    ref: s.requests.ref, completedAt: sql<string>`${s.requests.stageDates}->>'completed'`,
    startedAt: s.requests.privacyStartedAt, holdUntil: s.requests.privacyHoldUntil,
    holdReason: s.requests.privacyHoldReason,
    pendingFinance: sql<boolean>`exists(select 1 from transactions t where t.ref = ${s.requests.ref} and t.status = 'pending') or exists(select 1 from payouts p where p.ref = ${s.requests.ref} and p.status = 'pending')`,
  }).from(s.requests).where(sql`${s.requests.stage} = 'completed' and ${s.requests.privacyPurgedAt} is null`)
    .orderBy(sql`${s.requests.stageDates}->>'completed'`).limit(10);
  const [lifetime] = await d.select({
    fees: sql<number>`coalesce(sum(${s.transactions.ours}) filter (where ${s.transactions.status} = 'paid'), 0)::double precision`,
  }).from(s.transactions);
  const [financial] = await d.select({ count: sql<number>`count(*)::int` }).from(s.files).where(eq(s.files.retentionClass, "financial"));
  return {
    days: CASE_RETENTION_DAYS, ...totals, lifetimeFees: lifetime.fees, financialFiles: financial.count, lastRunAt, healthy,
    rows: rows.map((r) => ({ ...r, dueAt: r.completedAt && Number.isFinite(Date.parse(r.completedAt)) ? new Date(Date.parse(r.completedAt) + CASE_RETENTION_DAYS * 864e5).toISOString() : null })),
  };
}
export type PrivacyOverview = Awaited<ReturnType<typeof getPrivacyOverview>>;
