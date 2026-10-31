// Case lifecycle cleanup. Database/storage are injected so destructive behavior can be tested in isolation.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "./db";
import * as s from "./db/schema";

export const CASE_RETENTION_DAYS = 7;
export const ARCHIVE_ACCOUNT = "privacy-archive";
export const ARCHIVE_PROFILE = "privacy-archive";
const DAY = 864e5;
export const completedPurgeDue = (r: { stage: string; stageDates: Partial<Record<string, string>>; privacyPurgedAt?: string | null }, now: number) => {
  const completed = Date.parse(r.stageDates.completed ?? "");
  return r.stage === "completed" && !r.privacyPurgedAt && Number.isFinite(completed) && completed + CASE_RETENTION_DAYS * DAY <= now;
};

/** A started case stays locked and retryable. Existing file rows are durable deletion locators. */
export async function purgeCompletedCase(d: Db, ref: string, remove: (key: string) => Promise<void>, now = new Date()) {
  const at = now.toISOString();
  const claimed = await d.transaction(async (tx) => {
    const [r] = await tx.select().from(s.requests).where(eq(s.requests.ref, ref)).for("update");
    if (!r || !completedPurgeDue(r, now.getTime())) return "not-due" as const;
    if (r.privacyHoldUntil && Date.parse(r.privacyHoldUntil) > now.getTime()) return "held" as const;
    const [pendingPayment] = await tx.select({ id: s.transactions.id }).from(s.transactions).where(and(eq(s.transactions.ref, ref), eq(s.transactions.status, "pending"))).limit(1);
    const [pendingRefund] = await tx.select({ id: s.payouts.id }).from(s.payouts).where(and(eq(s.payouts.ref, ref), eq(s.payouts.status, "pending"))).limit(1);
    if (pendingPayment || pendingRefund) return "pending-finance" as const;
    const events = await tx.select().from(s.events).where(eq(s.events.ref, ref));
    const opened = events.find((e) => e.key === "ev.opened");
    const sources = ["Walk-in", "Phone call", "WhatsApp", "Referred by a customer"];
    const source = !opened || opened.by === "customer" ? "Online" : sources.includes(opened.body ?? "") ? opened.body! : "Other";
    await tx.update(s.requests).set({
      privacyStartedAt: r.privacyStartedAt ?? at,
      privacyReturned: r.privacyReturned || events.some((e) => e.key === "ev.resubmitted" || e.title.startsWith("Returned")),
      privacySource: r.privacySource ?? source,
    }).where(eq(s.requests.ref, ref));
    await tx.delete(s.requestLinks).where(eq(s.requestLinks.ref, ref));
    await tx.delete(s.outbox).where(eq(s.outbox.ref, ref));
    return "claimed" as const;
  });
  if (claimed !== "claimed") return { status: claimed, files: 0 };

  // Delete bytes first. If storage fails or this worker stops, locators remain for the next run.
  // A case lock blocks new reads/writes; deletion is idempotent and can be resumed after any partial failure.
  const files = await d.select().from(s.files).where(and(eq(s.files.ref, ref), eq(s.files.retentionClass, "operational")));
  for (const f of files) await remove(f.storageKey);

  return d.transaction(async (tx) => {
    const [r] = await tx.select().from(s.requests).where(eq(s.requests.ref, ref)).for("update");
    if (!r || r.privacyPurgedAt) return { status: "already-purged" as const, files: 0 };
    if (!r.privacyStartedAt) throw new Error("Privacy cleanup lost its case lock");
    // A shared tombstone keeps counts, service trends, turnaround, invoices and income joins intact,
    // without retaining the operational connection to the original account/profile.
    await tx.insert(s.accounts).values({ id: ARCHIVE_ACCOUNT, name: "Archived client", first: "Archived", deletedAt: at, whatsapp: false }).onConflictDoNothing();
    await tx.insert(s.profiles).values({ id: ARCHIVE_PROFILE, accountId: ARCHIVE_ACCOUNT, kind: "person", name: "Archived client" }).onConflictDoNothing();
    await tx.delete(s.requestDocuments).where(eq(s.requestDocuments.ref, ref));
    await tx.delete(s.deliverables).where(eq(s.deliverables.ref, ref));
    if (files.length) await tx.delete(s.files).where(inArray(s.files.id, files.map((f) => f.id)));
    await tx.delete(s.messages).where(eq(s.messages.ref, ref));
    await tx.delete(s.notes).where(eq(s.notes.ref, ref));
    await tx.delete(s.events).where(eq(s.events.ref, ref));
    await tx.delete(s.outbox).where(eq(s.outbox.ref, ref));
    await tx.delete(s.staffNotifications).where(eq(s.staffNotifications.ref, ref));
    await tx.delete(s.notifications).where(sql`position(${ref} in ${s.notifications.href}) > 0`);
    await tx.delete(s.reminders).where(sql`position(${ref} in ${s.reminders.href}) > 0`);
    // Preserve accountability action/time, removing incidental case text and customer display names.
    // Financial audit evidence remains separately subject to the accounting retention review.
    await tx.update(s.audit).set({ entity: ref }).where(and(eq(s.audit.fee, false), sql`position(${ref} in ${s.audit.entity}) > 0`));
    await tx.update(s.audit).set({ actor: "Client" }).where(and(eq(s.audit.role, "Customer"), sql`position(${ref} in ${s.audit.entity}) > 0`));
    await tx.update(s.requests).set({
      privacyPurgedAt: at, privacyHoldUntil: null, privacyHoldReason: null,
      profileId: ARCHIVE_PROFILE, title: null, contactPhone: null, contactEmail: null,
      officialRef: null, officialBill: null, dependsOn: null, purpose: null, answers: null,
      deliverVia: null, hold: null, followUp: null, handover: null,
      idReview: null, idReviewNote: null, idReviewAt: null, idReviewBy: null, idConsent: false,
      requirementsSnapshot: null, oursNote: null,
      channel: "Archived", next: "Operational case information removed after completion.",
      closed: r.closed ? { kind: r.closed.kind, at: r.closed.at, reason: "Closed" } : null,
      summary: { title: "Completed · privacy archived", body: "Operational details and documents have been removed. Minimal reporting and necessary financial records remain." },
    }).where(eq(s.requests.ref, ref));

    // Do not wipe shared identity needed by another case or an active tax engagement.
    const [otherCase] = await tx.select({ ref: s.requests.ref }).from(s.requests).where(eq(s.requests.profileId, r.profileId)).limit(1);
    const [tax] = await tx.select({ id: s.taxWatches.id }).from(s.taxWatches).where(and(eq(s.taxWatches.profileId, r.profileId), eq(s.taxWatches.active, true))).limit(1);
    if (!otherCase && !tax) {
      await tx.update(s.profiles).set({ name: "Archived client", nationalId: null, idMasked: null, tin: null, tinMasked: null, district: null, dateOfBirth: null, idCheckedAt: null, idCheckedBy: null }).where(eq(s.profiles.id, r.profileId));
      await tx.delete(s.clientNotes).where(eq(s.clientNotes.profileId, r.profileId));
      await tx.delete(s.clientTags).where(eq(s.clientTags.profileId, r.profileId));
      const [profile] = await tx.select({ accountId: s.profiles.accountId }).from(s.profiles).where(eq(s.profiles.id, r.profileId));
      if (profile) {
        const [account] = await tx.select().from(s.accounts).where(eq(s.accounts.id, profile.accountId)).for("update");
        const [remaining] = await tx.select({ ref: s.requests.ref }).from(s.requests).innerJoin(s.profiles, eq(s.profiles.id, s.requests.profileId)).where(eq(s.profiles.accountId, profile.accountId)).limit(1);
        const [engagement] = await tx.select({ id: s.taxWatches.id }).from(s.taxWatches).innerJoin(s.profiles, eq(s.profiles.id, s.taxWatches.profileId)).where(and(eq(s.profiles.accountId, profile.accountId), eq(s.taxWatches.active, true))).limit(1);
        if (account && !account.registeredAt && !remaining && !engagement) {
          await tx.update(s.accounts).set({ name: "Archived client", first: "Archived", phone: null, email: null, whatsapp: false, languages: [], deletedAt: at }).where(eq(s.accounts.id, account.id));
          await tx.delete(s.notifications).where(eq(s.notifications.accountId, account.id));
          await tx.delete(s.reminders).where(eq(s.reminders.accountId, account.id));
          await tx.delete(s.sessions).where(and(eq(s.sessions.kind, "customer"), eq(s.sessions.subjectId, account.id)));
        }
      }
    }
    return { status: "purged" as const, files: files.length };
  });
}

export async function sweepCompletedCases(d: Db, remove: (key: string) => Promise<void>, now = new Date()) {
  const cutoff = new Date(now.getTime() - CASE_RETENTION_DAYS * DAY).toISOString();
  const rows = await d.select({ ref: s.requests.ref }).from(s.requests).where(and(
    eq(s.requests.stage, "completed"), isNull(s.requests.privacyPurgedAt),
    sql`(${s.requests.privacyHoldUntil} is null or ${s.requests.privacyHoldUntil} <= ${now.toISOString()}::timestamptz)`,
    sql`not exists(select 1 from transactions t where t.ref = ${s.requests.ref} and t.status = 'pending')`,
    sql`not exists(select 1 from payouts p where p.ref = ${s.requests.ref} and p.status = 'pending')`,
    sql`(${s.requests.stageDates}->>'completed')::timestamptz <= ${cutoff}::timestamptz`,
  )).orderBy(s.requests.openedAt).limit(25);
  let purged = 0, files = 0, held = 0, pendingFinance = 0, failed = 0;
  for (const r of rows) {
    try {
      const result = await purgeCompletedCase(d, r.ref, remove, now);
      if (result.status === "purged") { purged++; files += result.files; }
      if (result.status === "held") held++;
      if (result.status === "pending-finance") pendingFinance++;
    } catch {
      failed++;
      // No client content, filenames, storage keys or provider responses in job logs.
      console.error("[privacy] case cleanup failed; durable locators retained", r.ref);
    }
  }
  return { purged, files, held, pendingFinance, failed, ...(failed ? { error: `${failed} case cleanup(s) need retry` } : {}) };
}
