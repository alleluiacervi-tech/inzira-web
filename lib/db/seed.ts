// Fills an empty database with the catalogue and the sample customers, staff and requests from
// lib/mock. Used automatically for the development database, or with `npm run db:seed`.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { CATEGORIES, SERVICES } from "../mock/catalogue";
import { ACCOUNTS, PROFILES, STAFF } from "../mock/people";
import { AUDIT, NOTIFICATIONS, REQUESTS } from "../mock/requests";
import { REMINDERS } from "../mock/admin";
import { DEFAULT_MATRIX, ROLES, type Permission } from "../permissions";
import { isDemo } from "../demo";
import { sendsRealEmail } from "../email";
import { putFile } from "../storage";
import type { Db } from "./index";
import * as s from "./schema";

const digits = (p: string) => p.replace(/\D/g, "").slice(-9);

/** Sign-in addresses for the sample staff (demo only). Nothing is ever delivered to example.com. */
export const STAFF_EMAILS: Record<string, string> = {
  "s-eric": "eric@example.com", "s-grace": "grace@example.com", "s-patrick": "patrick@example.com", "s-olivier": "olivier@example.com",
  "s-claudine": "claudine@example.com", "s-jp": "jeanpaul@example.com", "s-solange": "solange@example.com", "s-diane": "diane@example.com",
};

/** Phone numbers for the sample staff (demo only). */
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

/** What every database needs: categories, the service catalogue with our prices, the default
 *  permissions and the running numbers. No customers. */
async function catalogue(tx: Tx) {
    await tx.insert(s.categories).values(CATEGORIES.map((c, i) => ({ ...c, position: i })));
    await tx.insert(s.services).values(SERVICES.map((v, i) => ({
      slug: v.slug, name: v.name, aka: v.aka, category: v.category, authority: v.authority, channel: v.channel, via: v.via, summary: v.summary,
      who: v.who, requirements: v.requirements, documents: v.documents, steps: v.steps, notes: v.notes,
      officialAmount: v.official.amount, officialMode: v.official.mode, officialLabel: v.official.label, officialNote: v.official.note, officialVerifiedAt: v.official.verifiedAt,
      ours: v.ours, oursUnit: v.oursUnit, time: v.time, docsShort: v.docsShort, popular: !!v.popular, audience: v.audience,
      purposes: v.purposes, purposeLabel: v.purposeLabel, noId: !!v.noId, flow: v.flow, stageLabels: v.stageLabels, visible: v.visible, position: i,
    })));
    await tx.insert(s.rolePermissions).values(
      (Object.keys(DEFAULT_MATRIX) as Permission[]).flatMap((perm) => ROLES.map((r, i) => ({ role: r.name, permission: perm, allowed: DEFAULT_MATRIX[perm][i] === "1" }))),
    );
    await tx.insert(s.counters).values([{ name: "request", value: 4900 }, { name: "invoice", value: 22200 }]);
}

/** Production first run: the catalogue plus one owner who can sign in and set everything else up. */
export async function setupProduction(db: Db, owner: { name: string; email: string; phone?: string }) {
  await db.transaction(async (tx) => {
    await catalogue(tx);
    await tx.insert(s.staff).values({ id: "s-owner", name: owner.name, email: owner.email.trim().toLowerCase(), phone: owner.phone ? digits(owner.phone) : null, role: "Owner", team: "Management", title: "Owner", active: true });
  });
}

/** Development and demos: the catalogue plus the sample customers, staff and requests. */
export async function seed(db: Db) {
  const files: SeedFile[] = [];
  await db.transaction(async (tx) => {
    files.length = 0;
    await catalogue(tx);
    await tx.insert(s.accounts).values(ACCOUNTS.map((a) => ({ ...a, phone: digits(a.phone) })));
    await tx.insert(s.profiles).values(PROFILES);
    await tx.insert(s.staff).values(STAFF.map((p) => ({ ...p, phone: STAFF_PHONES[p.id] ?? null, email: STAFF_EMAILS[p.id] ?? null })));

    for (const r of REQUESTS) {
      const b = r.billing;
      await tx.insert(s.requests).values({
        ref: r.ref, serviceSlug: r.serviceSlug, title: r.title, profileId: r.profileId, agentId: r.agentId, openedAt: r.openedAt,
        stage: r.stage, stageDates: r.stageDates, hold: r.hold, closed: r.closed, channel: r.channel, officialRef: r.officialRef, dependsOn: r.dependsOn,
        summary: r.summary, next: r.next, followUp: r.followUp,
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

    await tx.insert(s.notifications).values(NOTIFICATIONS.map((n) => ({ accountId: "acc-aline", icon: n.icon, title: n.title, at: n.at, unread: !!n.unread, href: n.href })));
    await tx.insert(s.reminders).values(REMINDERS.map((m) => ({ accountId: m.accountId, title: m.title, body: m.body, cta: m.cta, href: m.href })));
    await tx.insert(s.audit).values([...AUDIT].reverse());
  });
}

/** Makes the documented sample sign-ins work on a development or demo database, and fills in the email
 *  of sample rows created before email existed. Never on a live site, and never once a real email provider
 *  is connected. It does not overwrite anything that is already there. */
export async function ensureDemoSignIns(database: Db) {
  if (!isDemo() || sendsRealEmail()) return;
  const [haveAccounts, haveStaff, perm] = await Promise.all([
    database.select({ id: s.accounts.id }).from(s.accounts).where(inArray(s.accounts.id, ACCOUNTS.map((a) => a.id))),
    database.select({ id: s.staff.id }).from(s.staff).where(inArray(s.staff.id, STAFF.map((p) => p.id))),
    database.select({ role: s.rolePermissions.role }).from(s.rolePermissions).limit(1),
  ]);
  const accountIds = new Set(haveAccounts.map((a) => a.id)), staffIds = new Set(haveStaff.map((p) => p.id));
  const accounts = ACCOUNTS.filter((a) => !accountIds.has(a.id)).map((a) => ({ ...a, phone: digits(a.phone) }));
  if (accounts.length) await database.insert(s.accounts).values(accounts).onConflictDoNothing();
  const profiles = PROFILES.filter((p) => !accountIds.has(p.accountId));
  if (profiles.length) await database.insert(s.profiles).values(profiles).onConflictDoNothing();
  const staff = STAFF.filter((p) => STAFF_PHONES[p.id] && !staffIds.has(p.id)).map((p) => ({ ...p, phone: STAFF_PHONES[p.id], email: STAFF_EMAILS[p.id] }));
  if (staff.length) await database.insert(s.staff).values(staff).onConflictDoNothing();
  for (const a of ACCOUNTS) if (a.email && accountIds.has(a.id)) await database.update(s.accounts).set({ email: a.email }).where(and(eq(s.accounts.id, a.id), isNull(s.accounts.email)));
  for (const [id, email] of Object.entries(STAFF_EMAILS)) if (staffIds.has(id)) await database.update(s.staff).set({ email }).where(and(eq(s.staff.id, id), isNull(s.staff.email)));
  if (!perm.length) {
    await database.insert(s.rolePermissions).values(
      (Object.keys(DEFAULT_MATRIX) as Permission[]).flatMap((permission) => ROLES.map((r, i) => ({ role: r.name, permission, allowed: DEFAULT_MATRIX[permission][i] === "1" }))),
    ).onConflictDoNothing();
  }
}
