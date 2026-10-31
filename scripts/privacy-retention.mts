// Destructive integration tests run ONLY against this new in-memory PGlite instance.
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, sql } from "drizzle-orm";
import * as s from "../lib/db/schema.ts";
import type { Db } from "../lib/db/index.ts";
import { ARCHIVE_PROFILE, completedPurgeDue, purgeCompletedCase, sweepCompletedCases } from "../lib/case-retention.ts";

const client = new PGlite("memory://");
const d = drizzle(client, { schema: s }) as unknown as Db;
const now = new Date("2026-10-31T12:00:00.000Z");
const ago = (days: number) => new Date(+now - days * 864e5).toISOString();
let checks = 0;
const check = async (name: string, fn: () => Promise<void> | void) => { await fn(); checks++; console.log(`  ok ${name}`); };
try {
  await migrate(d as never, { migrationsFolder: "./drizzle" });
  await d.insert(s.categories).values({ id: "test", icon: "file", name: "Test", short: "Test", desc: "Synthetic" });
  await d.insert(s.services).values({ slug: "test", name: "Synthetic service", category: "test", authority: "Test", channel: "Test", via: "Test", summary: "Test", who: [], requirements: [], documents: [], steps: [], notes: [], officialNote: "Test", ours: 3500, time: "Test", docsShort: "Test", audience: [] });

  async function fixture(ref: string, days: number, overrides: Partial<typeof s.requests.$inferInsert> = {}, registered = false) {
    await d.insert(s.accounts).values({ id: ref, name: "SYNTHETIC PRIVATE NAME", first: "Synthetic", phone: ref, email: `${ref}@example.invalid`, registeredAt: registered ? ago(20) : null, locale: "en" });
    await d.insert(s.profiles).values({ id: ref, accountId: ref, kind: "person", name: "SYNTHETIC PRIVATE NAME", nationalId: "SYNTHETIC-ID", dateOfBirth: "1990-01-01", district: "PRIVATE DISTRICT" });
    await d.insert(s.requests).values({ ref, serviceSlug: "test", profileId: ref, openedAt: ago(days + 2), stage: "completed", stageDates: { received: ago(days + 2), completed: ago(days) }, channel: "Test", summary: { title: "PRIVATE", body: "PRIVATE" }, next: "PRIVATE", contactEmail: "private@example.invalid", contactPhone: "PRIVATE", answers: [{ key: "plate", value: "PRIVATE" }], invoice: `INV-${ref}`, official: 500, officialLabel: "Official fee", ours: 3500, oursStandard: 3500, quote: "approved", officialReceipt: "attached", ...overrides });
    await d.insert(s.transactions).values({ ref, receipt: `R-${ref}`, method: "Cash", official: 500, ours: 3500, status: "paid", payer: "FINANCE-IDENTITY" });
    await d.insert(s.events).values([{ ref, title: "Opened", key: "ev.opened", by: "staff-test", body: "Walk-in" }, { ref, title: "Returned for correction", key: "ev.resubmitted", body: "PRIVATE", by: "staff-test" }]);
    await d.insert(s.messages).values({ ref, by: "customer", body: "PRIVATE MESSAGE" });
    await d.insert(s.notes).values({ ref, by: "staff-test", body: "PRIVATE NOTE" });
    await d.insert(s.files).values([
      { id: `${ref}-support`, ref, storageKey: `${ref}/support`, name: "PRIVATE-ID.pdf", mime: "application/pdf", bytes: 20, uploadedBy: "customer" },
      { id: `${ref}-result`, ref, storageKey: `${ref}/result`, name: "PRIVATE-CERTIFICATE.pdf", mime: "application/pdf", bytes: 20, uploadedBy: "staff-test" },
      { id: `${ref}-receipt`, ref, storageKey: `${ref}/receipt`, name: "receipt.pdf", mime: "application/pdf", bytes: 20, uploadedBy: "staff-test", retentionClass: "financial" },
    ]);
    await d.insert(s.requestDocuments).values({ id: `${ref}-doc`, ref, name: "Identity", group: "Other", status: "approved", required: true, fileId: `${ref}-support` });
    await d.insert(s.deliverables).values({ id: `${ref}-delivery`, ref, name: "PRIVATE CERTIFICATE", issuedAt: ago(days), issuedBy: "Test", fileId: `${ref}-result` });
    await d.insert(s.outbox).values({ ref, channel: "email", recipient: "private@example.invalid", payload: { text: "PRIVATE" } });
    await d.insert(s.audit).values({ actor: "PRIVATE NAME", role: "Customer", action: "Opened request", entity: `${ref} · PRIVATE`, source: "Test" });
    await d.insert(s.requestLinks).values({ id: ref, ref, kind: "view", email: "private@example.invalid", expiresAt: ago(-10) });
  }
  const row = async (ref: string) => (await d.select().from(s.requests).where(eq(s.requests.ref, ref)))[0];
  const totals = async () => {
    const [counts] = await d.select({ cases: sql<number>`count(*)::int`, complete: sql<number>`count(*) filter (where stage = 'completed')::int` }).from(s.requests);
    const [income] = await d.select({ ours: sql<number>`sum(ours)::int`, official: sql<number>`sum(official)::int` }).from(s.transactions);
    return { ...counts, ...income };
  };
  const removed = new Set<string>();
  const remove = async (key: string) => { removed.add(key); };

  await check("seven-day boundary is exact; open, missing-date and already-purged cases are excluded", () => {
    assert.equal(completedPurgeDue({ stage: "completed", stageDates: { completed: ago(7) } }, +now), true);
    assert.equal(completedPurgeDue({ stage: "completed", stageDates: { completed: ago(7 - 1 / 86400) } }, +now), false);
    assert.equal(completedPurgeDue({ stage: "checking", stageDates: { completed: ago(20) } }, +now), false);
    assert.equal(completedPurgeDue({ stage: "completed", stageDates: {} }, +now), false);
    assert.equal(completedPurgeDue({ stage: "completed", stageDates: { completed: ago(20) }, privacyPurgedAt: ago(1) }, +now), false);
  });
  await fixture("CASE-OLD", 8);
  const before = await totals();
  await check("storage failure preserves durable locators and does not report a completed purge", async () => {
    await assert.rejects(purgeCompletedCase(d, "CASE-OLD", async (key) => { if (key.endsWith("result")) throw new Error("injected storage outage"); removed.add(key); }, now));
    const r = await row("CASE-OLD");
    assert.ok(r.privacyStartedAt); assert.equal(r.privacyPurgedAt, null);
    assert.equal((await d.select().from(s.files).where(eq(s.files.ref, r.ref))).length, 3);
    assert.deepEqual(await totals(), before);
  });
  await check("database guards reject stale uploads, messages, notes and reopening after cleanup starts", async () => {
    await assert.rejects(d.insert(s.notes).values({ ref: "CASE-OLD", by: "staff-test", body: "stale" }));
    await assert.rejects(d.insert(s.transactions).values({ ref: "CASE-OLD", receipt: "STALE-PENDING", method: "Cash", ours: 1, official: 0, status: "pending" }));
    await assert.rejects(d.insert(s.messages).values({ ref: "CASE-OLD", by: "customer", body: "stale" }));
    await assert.rejects(d.insert(s.files).values({ id: "stale", ref: "CASE-OLD", storageKey: "stale", name: "stale", mime: "application/pdf", bytes: 1, uploadedBy: "customer" }));
    await assert.rejects(d.update(s.requests).set({ stage: "checking" }).where(eq(s.requests.ref, "CASE-OLD")));
    await assert.rejects(d.update(s.requests).set({ contactEmail: "stale@example.invalid" }).where(eq(s.requests.ref, "CASE-OLD")));
  });
  await check("retry removes operational content and identity link while preserving income, counts and finance evidence", async () => {
    assert.equal((await purgeCompletedCase(d, "CASE-OLD", remove, now)).status, "purged");
    const r = await row("CASE-OLD");
    assert.ok(r.privacyPurgedAt); assert.equal(r.profileId, ARCHIVE_PROFILE);
    for (const value of [r.answers, r.contactEmail, r.contactPhone, r.title, r.officialBill, r.handover, r.followUp]) assert.equal(value, null);
    for (const table of [s.messages, s.notes, s.events, s.requestDocuments, s.deliverables, s.outbox, s.requestLinks]) assert.equal((await d.select().from(table).where(eq(table.ref, r.ref))).length, 0);
    const files = await d.select().from(s.files).where(eq(s.files.ref, r.ref));
    assert.equal(files.length, 1); assert.equal(files[0].retentionClass, "financial"); assert.equal(removed.has("CASE-OLD/receipt"), false);
    const [profile] = await d.select().from(s.profiles).where(eq(s.profiles.id, "CASE-OLD"));
    assert.equal(profile.nationalId, null); assert.equal(profile.dateOfBirth, null);
    const [account] = await d.select().from(s.accounts).where(eq(s.accounts.id, "CASE-OLD"));
    assert.equal(account.email, null); assert.ok(account.deletedAt);
    const [audit] = await d.select().from(s.audit).where(eq(s.audit.entity, r.ref));
    assert.equal(audit.actor, "Client");
    assert.equal(r.privacyReturned, true); assert.equal(r.privacySource, "Walk-in");
    assert.deepEqual(await totals(), before);
  });
  await check("repeat cleanup is idempotent and cannot double-count or delete finance evidence", async () => {
    assert.equal((await purgeCompletedCase(d, "CASE-OLD", remove, now)).status, "not-due");
    assert.deepEqual(await totals(), before);
  });
  await fixture("CASE-HELD", 10, { privacyHoldUntil: ago(-2), privacyHoldReason: "dispute" });
  await fixture("CASE-RECENT", 6);
  await fixture("CASE-OPEN", 20, { stage: "checking" });
  await fixture("CASE-PENDING", 10);
  await d.insert(s.transactions).values({ ref: "CASE-PENDING", receipt: "PENDING", method: "Cash", ours: 1, official: 0, status: "pending" });
  await check("holds, unresolved payments, recent completions and open cases are not deleted", async () => {
    assert.equal((await purgeCompletedCase(d, "CASE-HELD", remove, now)).status, "held");
    assert.equal((await purgeCompletedCase(d, "CASE-PENDING", remove, now)).status, "pending-finance");
    assert.equal((await purgeCompletedCase(d, "CASE-RECENT", remove, now)).status, "not-due");
    assert.equal((await purgeCompletedCase(d, "CASE-OPEN", remove, now)).status, "not-due");
    for (const ref of ["CASE-HELD", "CASE-PENDING", "CASE-RECENT", "CASE-OPEN"]) assert.equal((await row(ref)).privacyStartedAt, null);
  });
  await fixture("CASE-REGISTERED", 10, {}, true);
  await check("case cleanup preserves registered account contact independently", async () => {
    await purgeCompletedCase(d, "CASE-REGISTERED", remove, now);
    const [account] = await d.select().from(s.accounts).where(eq(s.accounts.id, "CASE-REGISTERED"));
    assert.equal(account.email, "CASE-REGISTERED@example.invalid"); assert.equal(account.deletedAt, null);
    assert.equal((await row("CASE-REGISTERED")).profileId, ARCHIVE_PROFILE);
  });
  await fixture("CASE-SHARED", 9);
  await d.insert(s.requests).values({ ref: "CASE-SHARED-ACTIVE", serviceSlug: "test", profileId: "CASE-SHARED", openedAt: ago(1), stage: "checking", stageDates: {}, channel: "Test", summary: { title: "Active", body: "Active" }, next: "Continue", invoice: "SHARED-ACTIVE", officialLabel: "Official", ours: 3500, oursStandard: 3500, quote: "estimate", officialReceipt: "na" });
  await check("another active case preserves shared profile identity and contact", async () => {
    await purgeCompletedCase(d, "CASE-SHARED", remove, now);
    const [profile] = await d.select().from(s.profiles).where(eq(s.profiles.id, "CASE-SHARED"));
    assert.equal(profile.nationalId, "SYNTHETIC-ID");
    assert.equal((await row("CASE-SHARED-ACTIVE")).profileId, "CASE-SHARED");
  });
  await fixture("CASE-EXPIRED-HOLD", 9, { privacyHoldUntil: ago(1), privacyHoldReason: "legal" });
  await check("expired holds resume cleanup through the batch sweep", async () => {
    const result = await sweepCompletedCases(d, remove, now);
    assert.equal(result.purged, 1); assert.equal(result.failed, 0);
    assert.ok((await row("CASE-EXPIRED-HOLD")).privacyPurgedAt);
    assert.equal((await row("CASE-HELD")).privacyPurgedAt, null);
  });
  await check("authorized financial evidence/settlement remains possible after purge without reopening operational content", async () => {
    await d.insert(s.files).values({ id: "later-financial-receipt", ref: "CASE-OLD", storageKey: "CASE-OLD/later-receipt", retentionClass: "financial", name: "receipt.pdf", mime: "application/pdf", bytes: 10, uploadedBy: "finance" });
    await d.insert(s.payouts).values({ ref: "CASE-OLD", amount: 10, phone: "FINANCIAL-RECORD", reason: "Financial adjustment", status: "pending", by: "finance" });
    await d.update(s.requests).set({ officialReceipt: "attached" }).where(eq(s.requests.ref, "CASE-OLD"));
    await assert.rejects(d.insert(s.messages).values({ ref: "CASE-OLD", by: "customer", body: "must remain blocked" }));
    assert.equal((await row("CASE-OLD")).profileId, ARCHIVE_PROFILE);
  });
  console.log(`\n${checks} privacy retention integration checks passed (isolated memory database).`);
} finally { await client.close(); }
