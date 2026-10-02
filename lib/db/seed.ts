// Fills an empty database with the catalogue and the sample customers, staff and requests from
// lib/mock. Used automatically for the development database, or with `npm run db:seed`.
import { CATEGORIES, SERVICES } from "../mock/catalogue";
import { ACCOUNTS, PROFILES, STAFF } from "../mock/people";
import { AUDIT, NOTIFICATIONS, REQUESTS } from "../mock/requests";
import { REMINDERS } from "../mock/admin";
import { DEFAULT_MATRIX, ROLES, type Permission } from "../permissions";
import type { Db } from "./index";
import * as s from "./schema";

const digits = (p: string) => p.replace(/\D/g, "").slice(-9);

/** Sign-in numbers for the sample staff (demo only). */
export const STAFF_PHONES: Record<string, string> = {
  "s-eric": "780000001", "s-grace": "780000002", "s-patrick": "780000003", "s-olivier": "780000004",
  "s-claudine": "780000005", "s-jp": "780000006", "s-solange": "780000007", "s-diane": "780000008",
};

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

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
export async function setupProduction(db: Db, owner: { name: string; phone: string }) {
  await db.transaction(async (tx) => {
    await catalogue(tx);
    await tx.insert(s.staff).values({ id: "s-owner", name: owner.name, phone: digits(owner.phone), role: "Owner", team: "Management", title: "Owner", active: true });
  });
}

/** Development and demos: the catalogue plus the sample customers, staff and requests. */
export async function seed(db: Db) {
  await db.transaction(async (tx) => {
    await catalogue(tx);
    await tx.insert(s.accounts).values(ACCOUNTS.map((a) => ({ ...a, phone: digits(a.phone) })));
    await tx.insert(s.profiles).values(PROFILES);
    await tx.insert(s.staff).values(STAFF.map((p) => ({ ...p, phone: STAFF_PHONES[p.id] ?? null })));

    for (const r of REQUESTS) {
      const b = r.billing;
      await tx.insert(s.requests).values({
        ref: r.ref, serviceSlug: r.serviceSlug, title: r.title, profileId: r.profileId, agentId: r.agentId, openedAt: r.openedAt,
        stage: r.stage, stageDates: r.stageDates, hold: r.hold, closed: r.closed, channel: r.channel, officialRef: r.officialRef, dependsOn: r.dependsOn,
        summary: r.summary, next: r.next, followUp: r.followUp,
        invoice: b.invoice, official: b.official, officialMode: b.officialMode, officialLabel: b.officialLabel, ours: b.ours, oursStandard: b.oursStandard,
        oursUnit: b.oursUnit, oursNote: b.oursNote, quote: b.quote, dueAt: b.dueAt, officialReceipt: b.officialReceipt,
      });
      if (r.documents.length) await tx.insert(s.requestDocuments).values(r.documents.map((d, i) => ({
        id: d.id, ref: r.ref, position: i, name: d.name, group: d.group, required: d.required, status: d.status,
        fileName: d.file?.name, fileSize: d.file?.size, uploadedAt: d.file?.uploadedAt, note: d.note, reviewedAt: d.reviewedAt, reviewedBy: d.reviewedBy,
      })));
      if (r.deliverables.length) await tx.insert(s.deliverables).values(r.deliverables.map((d) => ({ ...d, ref: r.ref })));
      if (r.messages.length) await tx.insert(s.messages).values(r.messages.map((m) => ({ ref: r.ref, at: m.at, by: m.by, body: m.body })));
      if (r.notes.length) await tx.insert(s.notes).values(r.notes.map((n) => ({ ref: r.ref, at: n.at, by: n.by, body: n.body })));
      if (r.events.length) await tx.insert(s.events).values([...r.events].reverse().map((e) => ({ ref: r.ref, at: e.at, title: e.title, by: e.by, body: e.body })));
      if (b.transactions.length) await tx.insert(s.transactions).values(b.transactions.map((t) => ({ ref: r.ref, ...t })));
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
