// What happens to personal data once the work is done. Server only.
//
// - Customer documents (ID copies, leases, anything uploaded against a request's checklist) are deleted
//   on request once a request is finished, and automatically DOC_RETENTION_DAYS after it finished.
// - Deliverables (certificates we hand over) stay until the customer deletes their account.
// - Payments, invoices and official receipts are financial records and are kept, as the law requires.
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema as s, type Db } from "./db";
import type { Locale } from "./i18n/locale";
import { text } from "./i18n/messages";
import { msg } from "./i18n/stored";
import { event } from "./mutate";
import { dropOutboxFor } from "./outbox";
import { deleteFile } from "./storage";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const RETENTION_DAYS = Math.max(1, Number(process.env.DOC_RETENTION_DAYS) || 90);

/** When a request stopped needing its documents, or null while it is still open. */
export function finishedAt(r: { stage: string; stageDates: Partial<Record<string, string>>; closed: { at: string } | null }) {
  if (r.closed) return r.closed.at;
  return r.stage === "completed" ? r.stageDates.completed ?? null : null;
}

/** Customer documents still stored for these requests. */
async function storedDocuments(tx: Tx | Db, refs: string[]) {
  if (!refs.length) return [];
  return tx.select({ docId: s.requestDocuments.id, ref: s.requestDocuments.ref, fileId: s.files.id, key: s.files.storageKey })
    .from(s.requestDocuments).innerJoin(s.files, eq(s.files.id, s.requestDocuments.fileId))
    .where(and(inArray(s.requestDocuments.ref, refs), isNotNull(s.requestDocuments.fileId)));
}

/**
 * Deletes the customer documents of these requests: the stored bytes, the file rows, and the link from
 * the checklist (which keeps its review status, so the history still reads correctly).
 * Returns how many files were removed.
 */
export type PurgeReason = "customer" | "retention" | "account";
// The checklist note is English for the staff screens; i18n/stored.documentNote translates it for customers.
const NOTE_REASON: Record<PurgeReason, string> = {
  customer: "at the customer’s request",
  retention: `${RETENTION_DAYS} days after the request finished`,
  account: "when the customer deleted their account",
};
export async function purgeDocuments(refs: string[], why: PurgeReason): Promise<number> {
  const reason = NOTE_REASON[why];
  const d = await db();
  const docs = await storedDocuments(d, refs);
  if (!docs.length) return 0;
  const when = new Date().toISOString();
  await d.transaction(async (tx) => {
    await tx.update(s.requestDocuments).set({ fileId: null, fileName: null, fileSize: null, note: `File deleted ${reason} on ${when.slice(0, 10)}.` })
      .where(inArray(s.requestDocuments.id, docs.map((x) => x.docId)));
    await tx.delete(s.files).where(inArray(s.files.id, docs.map((x) => x.fileId)));
    for (const ref of new Set(docs.map((x) => x.ref))) {
      const n = docs.filter((x) => x.ref === ref).length;
      await event(tx, ref, why === "customer" ? msg("ev.docsDeletedCustomer", { n }) : why === "account" ? msg("ev.docsDeletedAccount", { n }) : msg("ev.docsDeletedRetention", { n, days: RETENTION_DAYS }), "system");
    }
  });
  // Bytes go after the database: a failed delete leaves an orphan file, never a row pointing at nothing.
  for (const x of docs) await deleteFile(x.key).catch((e) => console.error("[privacy] could not delete", x.key, e));
  return docs.length;
}

/** The account's finished requests that still hold customer documents. */
export async function finishedWithDocuments(accountId: string) {
  const d = await db();
  const rows = await d.select({ ref: s.requests.ref, stage: s.requests.stage, stageDates: s.requests.stageDates, closed: s.requests.closed })
    .from(s.requests).innerJoin(s.profiles, eq(s.profiles.id, s.requests.profileId)).where(eq(s.profiles.accountId, accountId));
  const finished = rows.filter((r) => finishedAt(r)).map((r) => r.ref);
  const docs = await storedDocuments(d, finished);
  return { refs: [...new Set(docs.map((x) => x.ref))], files: docs.length, open: rows.length - finished.length };
}

/** Scheduled: deletes customer documents of requests finished more than RETENTION_DAYS ago. */
export async function retentionSweep() {
  const d = await db();
  const cutoff = Date.now() - RETENTION_DAYS * 864e5;
  // The database narrows it to requests that finished before the cutoff; finishedAt then confirms each one.
  const finished = sql`coalesce(${s.requests.closed}->>'at', case when ${s.requests.stage} = 'completed' then ${s.requests.stageDates}->>'completed' end)`;
  const rows = await d.select({ ref: s.requests.ref, stage: s.requests.stage, stageDates: s.requests.stageDates, closed: s.requests.closed }).from(s.requests)
    .where(sql`${finished} is not null and (${finished})::timestamptz < ${new Date(cutoff).toISOString()}::timestamptz`);
  const due = rows.filter((r) => { const f = finishedAt(r); return f && Date.parse(f) < cutoff; }).map((r) => r.ref);
  return { deleted: await purgeDocuments(due, "retention") };
}

/**
 * Deletes a customer account. Only allowed when nothing is open. Personal details are wiped and every
 * stored file of theirs is deleted; requests, payments and receipts stay, anonymised, for the accounts.
 */
export async function deleteAccount(accountId: string, locale: Locale = "en"): Promise<{ ok: true } | { ok: false; error: string }> {
  const d = await db();
  const { open } = await finishedWithDocuments(accountId);
  if (open > 0) return { ok: false, error: open === 1 ? text(locale, "custErr.openOne") : text(locale, "custErr.openMany", { n: open }) };
  const profiles = await d.select({ id: s.profiles.id }).from(s.profiles).where(eq(s.profiles.accountId, accountId));
  const profileIds = profiles.map((p) => p.id);
  const refs = profileIds.length ? (await d.select({ ref: s.requests.ref }).from(s.requests).where(inArray(s.requests.profileId, profileIds))).map((r) => r.ref) : [];
  await purgeDocuments(refs, "account");
  // Messages still waiting to be sent to them are dropped with the account.
  const [contact] = await d.select({ email: s.accounts.email, phone: s.accounts.phone }).from(s.accounts).where(eq(s.accounts.id, accountId));
  if (contact) await dropOutboxFor([contact.email ?? "", contact.phone ?? ""]);

  // Deliverables are the customer's to keep, so they go with the account.
  const delivered = refs.length ? await d.select({ id: s.files.id, key: s.files.storageKey }).from(s.deliverables).innerJoin(s.files, eq(s.files.id, s.deliverables.fileId)).where(inArray(s.deliverables.ref, refs)) : [];
  const now = new Date().toISOString();
  await d.transaction(async (tx) => {
    if (delivered.length) {
      await tx.update(s.deliverables).set({ fileId: null }).where(inArray(s.deliverables.fileId, delivered.map((f) => f.id)));
      await tx.delete(s.files).where(inArray(s.files.id, delivered.map((f) => f.id)));
    }
    if (profileIds.length) {
      await tx.update(s.profiles).set({ name: "Deleted customer", idMasked: null, nationalId: null, tinMasked: null, tin: null, district: null }).where(inArray(s.profiles.id, profileIds));
      await tx.delete(s.taxPeriods).where(inArray(s.taxPeriods.profileId, profileIds));
      await tx.delete(s.taxWatches).where(inArray(s.taxWatches.profileId, profileIds));
      await tx.delete(s.clientTags).where(inArray(s.clientTags.profileId, profileIds));
      await tx.delete(s.clientNotes).where(inArray(s.clientNotes.profileId, profileIds));
    }
    if (refs.length) {
      await tx.update(s.messages).set({ body: "Message deleted with the customer’s account." }).where(and(inArray(s.messages.ref, refs), eq(s.messages.by, "customer")));
      await tx.update(s.transactions).set({ payer: null }).where(inArray(s.transactions.ref, refs));
      await tx.update(s.payouts).set({ phone: "deleted" }).where(inArray(s.payouts.ref, refs));
    }
    await tx.delete(s.notifications).where(eq(s.notifications.accountId, accountId));
    await tx.delete(s.reminders).where(eq(s.reminders.accountId, accountId));
    await tx.delete(s.sessions).where(and(eq(s.sessions.kind, "customer"), eq(s.sessions.subjectId, accountId)));
    // The phone number and email are freed so the person can start again later; the row stays for the accounts.
    await tx.update(s.accounts).set({ name: "Deleted customer", first: "Deleted", phone: `deleted:${accountId}`, email: null, whatsapp: false, languages: [], deletedAt: now }).where(eq(s.accounts.id, accountId));
  });
  for (const f of delivered) await deleteFile(f.key).catch((e) => console.error("[privacy] could not delete", f.key, e));
  return { ok: true };
}

