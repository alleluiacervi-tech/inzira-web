// Fills an empty database with the catalogue and the sample customers, staff and requests from
// lib/mock. Used automatically for the development database, or with `npm run db:seed`.
import { and, eq, inArray, sql } from "drizzle-orm";
import { idPolicyOf } from "../identity";
import { horizon, kigaliToday, periodsBetween, type PayRoute, type TaxKind } from "../tax-calendar";
import { CATEGORIES, SERVICES } from "../mock/catalogue";
import { ACCOUNTS, PROFILES, STAFF } from "../mock/people";
import { AUDIT, NOTIFICATIONS, REQUESTS } from "../mock/requests";
import { REMINDERS } from "../mock/admin";
import { DEFAULT_MATRIX, ROLES, type Permission } from "../permissions";
import { sendsRealEmail } from "../email";
import { isDemo, sendsRealSms } from "../sms";
import { putFile } from "../storage";
import type { Db } from "./index";
import * as s from "./schema";

const digits = (p: string) => p.replace(/\D/g, "").slice(-9);

/** Sign-in numbers for the sample staff (demo only). */
export const STAFF_PHONES: Record<string, string> = {
  "s-eric": "780000001", "s-grace": "780000002", "s-patrick": "780000003", "s-olivier": "780000004",
  "s-claudine": "780000005", "s-jp": "780000006", "s-solange": "780000007", "s-diane": "780000008",
};

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Tiny stand-ins so every seeded upload and issued document can be opened. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8PEA8QDw8PDw8PDw8PDw8PFREWFhURExUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGhAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAMABAAMBIgACEQEDEQH/xAAbAAABBQEBAAAAAAAAAAAAAAAEAQIDBQYBB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH0P//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//Z", "base64");
const PDF = Buffer.from("%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 80]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

type SeedFile = { id: string; ref: string; name: string; mime: string; bytes: Uint8Array; at: string; by: string };

function mockBlob(name: string): { mime: string; bytes: Uint8Array } {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "png") return { mime: "image/png", bytes: PNG };
  if (ext === "jpg" || ext === "jpeg" || ext === "webp" || ext === "heic" || ext === "heif") return { mime: "image/jpeg", bytes: JPEG };
  return { mime: "application/pdf", bytes: PDF };
}

const serviceRow = (v: (typeof SERVICES)[number], position: number) => ({
  slug: v.slug, name: v.name, aka: v.aka, category: v.category, authority: v.authority, channel: v.channel, via: v.via, summary: v.summary,
  who: v.who, requirements: v.requirements, documents: v.documents, steps: v.steps, notes: v.notes,
  officialAmount: v.official.amount, officialMode: v.official.mode, officialLabel: v.official.label, officialNote: v.official.note, officialVerifiedAt: v.official.verifiedAt,
  ours: v.ours, oursUnit: v.oursUnit, time: v.time, docsShort: v.docsShort, popular: !!v.popular, audience: v.audience,
  purposes: v.purposes, purposeLabel: v.purposeLabel, questions: v.questions, noId: idPolicyOf(v) === "none", idPolicy: idPolicyOf(v), flow: v.flow, stageLabels: v.stageLabels, visible: v.visible, position,
});

/** Adds catalogue rows a database does not have yet. Existing services keep the fees and wording already saved. */
export async function ensureCatalogue(database: Db) {
  const [cats, rows] = await Promise.all([
    database.select({ id: s.categories.id }).from(s.categories),
    database.select({ slug: s.services.slug }).from(s.services),
  ]);
  const haveCats = new Set(cats.map((c) => c.id));
  const missingCats = CATEGORIES.map((c, i) => ({ ...c, position: i })).filter((c) => !haveCats.has(c.id));
  if (missingCats.length) await database.insert(s.categories).values(missingCats).onConflictDoNothing();
  await Promise.all(CATEGORIES.map((c, i) => database.update(s.categories).set({ position: i, desc: c.desc }).where(eq(s.categories.id, c.id))));
  const have = new Set(rows.map((r) => r.slug));
  const missing = SERVICES.map((v, i) => serviceRow(v, i)).filter((v) => !have.has(v.slug));
  if (missing.length) await database.insert(s.services).values(missing).onConflictDoNothing();
  // Order follows the catalogue. Fees and wording already saved on a service stay as they are.
  await Promise.all(SERVICES.map((v, i) => database.update(s.services).set({ position: i }).where(eq(s.services.slug, v.slug))));
  await applyRevisions(database);
}

/** Catalogue corrections a database receives once, by id. Each rewrites the named services from the catalogue above
 *  (wording, documents, questions, fees, ID rule) and keeps whether they are shown. Edits staff make afterwards stay.
 *  Add a new id for a new correction; never change one that has shipped. */
const REVISIONS: { id: string; slugs: string[] }[] = [
  // 22 Oct 2026: checked against Irembo's support pages. Basic certificates need only the ID number, fixed Irembo fees
  // are paid with ours in one payment, two services are free, and each service asks its own questions.
  {
    id: "2026-10-irembo-audit",
    slugs: [
      "enterprise-registration", "company-registration", "business-amendment", "annual-return-filing", "trading-licence-registration",
      "property-tax-tin", "vehicle-income-tax-declaration", "trading-licence-declaration", "monthly-tax-declarations", "property-tax-declaration",
      "ebm-installation", "e-title", "land-spouse-update", "land-merging", "rura-vehicle-authorisation", "rura-authorisation-suspension",
      "criminal-record", "driving-licence-copy", "traffic-fine", "burundi-licence-exchange", "driving-licence-correction", "driving-licence-issuance",
      "driving-test-results", "driving-test-booking", "driving-licence-renewal", "vehicle-inspection", "birth-certificate", "marriage-certificate",
      "death-certificate", "residence-certificate", "single-status", "passport-application", "id-card-replacement",
    ],
  },
];

async function applyRevisions(database: Db) {
  const done = new Set((await database.select({ id: s.catalogueRevisions.id }).from(s.catalogueRevisions)).map((r) => r.id));
  for (const rev of REVISIONS) {
    if (done.has(rev.id)) continue;
    await database.transaction(async (tx) => {
      // Claimed first, so two instances starting at once do not both rewrite the rows.
      const claimed = await tx.insert(s.catalogueRevisions).values({ id: rev.id }).onConflictDoNothing().returning({ id: s.catalogueRevisions.id });
      if (!claimed.length) return;
      for (const slug of rev.slugs) {
        const i = SERVICES.findIndex((v) => v.slug === slug);
        if (i < 0) continue;
        const { slug: _slug, position: _position, visible: _visible, popular: _popular, ...fields } = serviceRow(SERVICES[i], i);
        // A field the catalogue no longer has (undefined) is cleared, not left as it was.
        const cleared = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v === undefined ? null : v]));
        await tx.update(s.services).set({ ...cleared, updatedAt: new Date().toISOString() }).where(eq(s.services.slug, slug));
      }
    });
  }
}

/** What every database needs: categories, the service catalogue with our prices, the default
 *  permissions and the running numbers. No customers. */
async function catalogue(tx: Tx) {
    await tx.insert(s.categories).values(CATEGORIES.map((c, i) => ({ ...c, position: i })));
    await tx.insert(s.services).values(SERVICES.map((v, i) => serviceRow(v, i)));
    await tx.insert(s.rolePermissions).values(
      (Object.keys(DEFAULT_MATRIX) as Permission[]).flatMap((perm) => ROLES.map((r, i) => ({ role: r.name, permission: perm, allowed: DEFAULT_MATRIX[perm][i] === "1" }))),
    );
    await tx.insert(s.counters).values([{ name: "request", value: 4900 }, { name: "invoice", value: 22200 }]);
}

/** Production first run: the catalogue plus one owner who can sign in and set everything else up. */
export async function setupProduction(db: Db, owner: { name: string; phone: string }) {
  await db.transaction(async (tx) => {
    await catalogue(tx);
    await tx.insert(s.staff).values({ id: "s-owner", name: owner.name, phone: digits(owner.phone), role: "Owner", team: "Management", title: "Owner", active: true });
  });
}

/** Development and demos: the catalogue plus the sample customers, staff and requests. */
export async function seed(db: Db) {
  const files: SeedFile[] = [];
  await db.transaction(async (tx) => {
    files.length = 0;
    await catalogue(tx);
    await tx.insert(s.accounts).values(ACCOUNTS.map((a) => ({ ...a, phone: digits(a.phone), registeredAt: a.since })));
    await tx.insert(s.profiles).values(PROFILES);
    await tx.insert(s.staff).values(STAFF.map((p) => ({ ...p, phone: STAFF_PHONES[p.id] ?? null, email: p.id === "s-diane" ? "admin@inzira.test" : null })));

    for (const r of REQUESTS) {
      const b = r.billing;
      const service = SERVICES.find((v) => v.slug === r.serviceSlug);
      const profile = PROFILES.find((p) => p.id === r.profileId);
      const policy = idPolicyOf(service);
      // Open person-requests keep a pending review. Finished ones are not marked checked: nobody reviewed them here.
      const idRequired = policy === "required" && profile?.kind === "person";
      await tx.insert(s.requests).values({
        ref: r.ref, serviceSlug: r.serviceSlug, title: r.title, profileId: r.profileId, agentId: r.agentId, openedAt: r.openedAt,
        stage: r.stage, stageDates: r.stageDates, hold: r.hold, closed: r.closed, channel: r.channel, officialRef: r.officialRef, dependsOn: r.dependsOn,
        summary: r.summary, next: r.next, followUp: r.followUp,
        idPolicy: policy, idRequired, idReview: idRequired && r.stage !== "completed" && !r.closed ? "pending" : null,
        requirementsSnapshot: service?.requirements ?? [],
        invoice: b.invoice, official: b.official, officialMode: b.officialMode, officialLabel: b.officialLabel, ours: b.ours, oursStandard: b.oursStandard,
        oursUnit: b.oursUnit, oursNote: b.oursNote, quote: b.quote, dueAt: b.dueAt, officialReceipt: b.officialReceipt,
      });
      if (r.documents.length) await tx.insert(s.requestDocuments).values(r.documents.map((d, i) => {
        const fileId = d.file ? `file-${d.id}` : null;
        if (d.file && fileId) {
          const blob = mockBlob(d.file.name);
          files.push({ id: fileId, ref: r.ref, name: d.file.name, mime: blob.mime, bytes: blob.bytes, at: d.file.uploadedAt, by: d.reviewedBy ?? r.agentId ?? "system" });
        }
        return {
          id: d.id, ref: r.ref, position: i, name: d.name, group: d.group, required: d.required, status: d.status, fileId,
          fileName: d.file?.name, fileSize: d.file?.size, uploadedAt: d.file?.uploadedAt, note: d.note, reviewedAt: d.reviewedAt, reviewedBy: d.reviewedBy,
        };
      }));
      if (r.deliverables.length) await tx.insert(s.deliverables).values(r.deliverables.map((d) => {
        const fileId = `file-${d.id}`;
        const name = `${d.name}.pdf`;
        const blob = mockBlob(name);
        files.push({ id: fileId, ref: r.ref, name, mime: blob.mime, bytes: blob.bytes, at: d.issuedAt, by: d.issuedBy });
        return { ...d, ref: r.ref, fileId };
      }));
      if (r.messages.length) await tx.insert(s.messages).values(r.messages.map((m) => ({ ref: r.ref, at: m.at, by: m.by, body: m.body })));
      if (r.notes.length) await tx.insert(s.notes).values(r.notes.map((n) => ({ ref: r.ref, at: n.at, by: n.by, body: n.body })));
      if (r.events.length) await tx.insert(s.events).values([...r.events].reverse().map((e) => ({ ref: r.ref, at: e.at, title: e.title, by: e.by, body: e.body })));
      if (b.transactions.length) await tx.insert(s.transactions).values(b.transactions.map((t) => ({ ref: r.ref, ...t })));
    }

    if (files.length) {
      await tx.insert(s.files).values(files.map((f) => ({
        id: f.id, ref: f.ref, storageKey: `${f.ref}/${f.id}`, name: f.name, mime: f.mime, bytes: f.bytes.byteLength, uploadedAt: f.at, uploadedBy: f.by,
      })));
      for (const f of files) await putFile(`${f.ref}/${f.id}`, f.bytes, f.mime);
    }

    // Default stage SLA targets (in hours)
    await tx.insert(s.stageTargets).values([
      { stage: "received", targetHours: 2 },
      { stage: "checking", targetHours: 4 },
      { stage: "preparing", targetHours: 24 },
      { stage: "institution", targetHours: 72 },
      { stage: "completed", targetHours: 0 },
    ]);

    // Initial saved views
    await tx.insert(s.savedViews).values([
      { id: "sv-unassigned", entity: "requests", name: "Unassigned", filters: { unassigned: true }, isDefault: false },
      { id: "sv-waiting-3d", entity: "requests", name: "Waiting on client over 3 days", filters: { waitingDays: 3 }, isDefault: false },
      { id: "sv-overdue-pay", entity: "requests", name: "Payment overdue", filters: { paymentStatus: "overdue" }, isDefault: false },
      { id: "sv-institution-7d", entity: "requests", name: "With institution over 7 days", filters: { stage: "institution", stageDays: 7 }, isDefault: false },
      { id: "sv-completed-week", entity: "requests", name: "Completed this week", filters: { stage: "completed", period: "week" }, isDefault: false },
      { id: "sv-cancelled", entity: "requests", name: "Cancelled", filters: { closed: "cancelled" }, isDefault: false },
    ]);

    // Client tags & notes
    await tx.insert(s.clientTags).values([
      { profileId: "p-aline", tag: "VIP" },
      { profileId: "p-aline", tag: "Tech" },
      { profileId: "p-umucyo", tag: "Corporate" },
      { profileId: "p-kff", tag: "Business" },
      { profileId: "p-kff", tag: "Repeat" },
      { profileId: "p-musanze", tag: "Cooperative" },
      { profileId: "p-ubumwe", tag: "Cyber" },
      { profileId: "p-inema", tag: "Retail" },
    ]);

    await tx.insert(s.clientNotes).values([
      { profileId: "p-aline", by: "s-eric", body: "Prefers communication via WhatsApp in English." },
      { profileId: "p-kff", by: "s-grace", body: "Requested consolidated monthly tax invoices." },
    ]);

    await seedTaxDiary(tx);
    await tx.insert(s.notifications).values(NOTIFICATIONS.map((n) => ({ accountId: "acc-aline", icon: n.icon, title: n.title, at: n.at, unread: !!n.unread, href: n.href })));
    await tx.insert(s.reminders).values(REMINDERS.map((m) => ({ accountId: m.accountId, title: m.title, body: m.body, cta: m.cta, href: m.href })));
    await tx.insert(s.audit).values([...AUDIT].reverse());
  });
}

const DEMO_WATCHES: { id: string; profileId: string; kind: TaxKind; payRoute: PayRoute; note: string }[] = [
  { id: "tw-umucyo-paye", profileId: "p-umucyo", kind: "paye-monthly", payRoute: "through_us", note: "Aline sends the PAYE money to Inzira. We pay RRA before the working day." },
  { id: "tw-kff-vat", profileId: "p-kff", kind: "vat-monthly", payRoute: "themselves", note: "They pay RRA themselves. The diary stays open until their receipt reference is saved." },
  { id: "tw-inema-tl", profileId: "p-inema", kind: "trading-quarterly", payRoute: "through_us", note: "Collect the trading-licence money before the working day." },
  { id: "tw-hope-prop", profileId: "p-hope", kind: "property", payRoute: "themselves", note: "Property tax. They pay RRA. We remind them and record the receipt." },
];

/** Sample taxpayers, so the diary is not empty in development. References are fictional. */
async function seedTaxDiary(tx: Tx) {
  const today = kigaliToday();
  await tx.insert(s.taxWatches).values(DEMO_WATCHES.map((w) => ({ ...w, createdBy: "Inzira" })));
  const { from, until } = horizon(today);
  const periods = DEMO_WATCHES.flatMap((w) => periodsBetween(w.kind, from, until).map((p) => ({
    id: `${w.id}:${p.periodKey}`, watchId: w.id, profileId: w.profileId, kind: w.kind, periodKey: p.periodKey,
    periodLabel: p.periodLabel, legalDue: p.legalDue, workBy: p.workBy, recordsBy: p.recordsBy, payRoute: w.payRoute,
  })));
  if (periods.length) await tx.insert(s.taxPeriods).values(periods);
  const paye = periods.filter((p) => p.watchId === "tw-umucyo-paye" && p.workBy < today).sort((a, b) => b.workBy.localeCompare(a.workBy));
  if (paye[0]) await tx.update(s.taxPeriods).set({ moneyReceipt: "INZ-R-22140", moneyAmount: 186000, moneyAt: new Date().toISOString() }).where(eq(s.taxPeriods.id, paye[0].id));
  if (paye[1]) await tx.update(s.taxPeriods).set({
    declarationRef: "DEC-88421", paymentRef: "PAY-190334", amountDue: 174000, paidAt: new Date().toISOString(), paidBy: "Solange Ishimwe",
    moneyReceipt: "INZ-R-21802", moneyAmount: 174000, moneyAt: new Date().toISOString(),
  }).where(eq(s.taxPeriods.id, paye[1].id));
}

const SAMPLE_ADMIN_EMAIL = "admin@inzira.test";
const SAMPLE_CUSTOMER_EMAIL = "aline.uwase@example.com";

/** Fills the two documented sample addresses when they are still blank, in development and demo builds.
 *  On a live site it does the opposite: it ends any session a sample account (an example.com or .test address)
 *  still has open, from before the live site stopped showing their codes. Real accounts are left alone. */
export async function linkSampleSignIns(database: Db) {
  if (!isDemo()) {
    const reserved = (col: string) => sql.raw(`(lower(${col}) like '%@example.com' or lower(${col}) like '%.test')`);
    await database.execute(sql`delete from ${s.sessions} where ${s.sessions.subjectId} in (
      select id from ${s.staff} where ${reserved("email")} union select id from ${s.accounts} where ${reserved("email")})`);
    return;
  }
  if (sendsRealEmail()) return;
  await database.update(s.staff).set({ email: SAMPLE_ADMIN_EMAIL }).where(and(eq(s.staff.id, "s-diane"), sql`email is null`));
  await database.update(s.accounts).set({ email: SAMPLE_CUSTOMER_EMAIL }).where(and(eq(s.accounts.id, "acc-aline"), eq(s.accounts.phone, "788123456"), sql`email is null`));
}

/** Makes the documented sample numbers able to sign in while SMS is not connected.
 *  Skipped once Africa's Talking is the provider, and it never overwrites an existing number. */
export async function ensureDemoSignIns(database: Db) {
  // Sample people with published phone numbers exist only in development and demo builds, never on a live site.
  if (sendsRealSms() || !isDemo()) return;
  const accountPhones = ACCOUNTS.map((a) => digits(a.phone));
  const staffPhones = Object.values(STAFF_PHONES);
  const [haveAccounts, haveStaff, perm] = await Promise.all([
    database.select({ phone: s.accounts.phone }).from(s.accounts).where(inArray(s.accounts.phone, accountPhones)),
    database.select({ phone: s.staff.phone }).from(s.staff).where(inArray(s.staff.phone, staffPhones)),
    database.select({ role: s.rolePermissions.role }).from(s.rolePermissions).limit(1),
  ]);
  const takenAccounts = new Set(haveAccounts.map((a) => a.phone));
  const takenStaff = new Set(haveStaff.map((p) => p.phone));
  const accounts = ACCOUNTS.filter((a) => !takenAccounts.has(digits(a.phone))).map((a) => ({ ...a, phone: digits(a.phone), registeredAt: a.since }));
  if (accounts.length) await database.insert(s.accounts).values(accounts).onConflictDoNothing();
  const present = new Set((await database.select({ id: s.accounts.id }).from(s.accounts).where(inArray(s.accounts.id, ACCOUNTS.map((a) => a.id)))).map((a) => a.id));
  const profiles = PROFILES.filter((p) => present.has(p.accountId));
  if (profiles.length) await database.insert(s.profiles).values(profiles).onConflictDoNothing();
  const staff = STAFF.filter((p) => STAFF_PHONES[p.id] && !takenStaff.has(STAFF_PHONES[p.id])).map((p) => ({ ...p, phone: STAFF_PHONES[p.id], email: p.id === "s-diane" ? "admin@inzira.test" : null }));
  if (staff.length) await database.insert(s.staff).values(staff).onConflictDoNothing();
  if (isDemo()) await database.update(s.staff).set({ email: "admin@inzira.test" }).where(and(eq(s.staff.id, "s-diane"), sql`email is null`));
  if (!perm.length) {
    await database.insert(s.rolePermissions).values(
      (Object.keys(DEFAULT_MATRIX) as Permission[]).flatMap((permission) => ROLES.map((r, i) => ({ role: r.name, permission, allowed: DEFAULT_MATRIX[permission][i] === "1" }))),
    ).onConflictDoNothing();
  }
}
