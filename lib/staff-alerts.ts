// In-app staff alerts, plus one SMS to the assigned agent when a customer writes or uploads.
// Written in the same transaction as the change. Server only.
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, iso, schema as s, type Db } from "./db";
import { enqueue, sendSoon } from "./outbox";
import { allow } from "./ratelimit";
import type { StaffAlert } from "./types";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type StaffPing = "reply" | "upload" | "payment" | "new";

const LEAD: Array<typeof s.staff.$inferSelect["role"]> = ["Owner", "Administrator", "Supervisor"];

async function recipients(tx: Tx | Db, ref: string): Promise<{ id: string; phone: string | null }[]> {
  const [req] = await tx.select({ agentId: s.requests.agentId }).from(s.requests).where(eq(s.requests.ref, ref));
  if (!req) return [];
  if (req.agentId) {
    const [row] = await tx.select({ id: s.staff.id, phone: s.staff.phone }).from(s.staff).where(and(eq(s.staff.id, req.agentId), eq(s.staff.active, true)));
    return row ? [row] : [];
  }
  const people = await tx.select({ id: s.staff.id, phone: s.staff.phone, role: s.staff.role }).from(s.staff).where(eq(s.staff.active, true));
  return people.filter((p) => LEAD.includes(p.role)).map(({ id, phone }) => ({ id, phone }));
}

/** Records an alert for the people who should see this case event. SMS only for a reply or upload on an assigned case. */
export async function notifyStaff(
  tx: Tx | Db,
  ref: string,
  n: { kind: StaffPing; icon: string; title: string; body?: string },
) {
  const people = await recipients(tx, ref);
  if (!people.length) return;
  const href = n.kind === "new" ? "/console/inbox" : `/console/requests/${ref}${n.kind === "reply" ? "#messages" : n.kind === "upload" ? "#documents" : ""}`;
  await tx.insert(s.staffNotifications).values(people.map((p) => ({
    staffId: p.id, icon: n.icon, title: n.title, body: n.body ?? null, href, ref,
  })));
  if (n.kind !== "reply" && n.kind !== "upload") return;
  if (people.length !== 1 || !people[0].phone || !/^7\d{8}$/.test(people[0].phone)) return;
  if (!(await allow(`staff-ping:${people[0].id}:${ref}`, 1, 10 * 60e3))) return;
  const text = n.kind === "reply"
    ? `Inzira ${ref}: the client replied. Open the staff console.`
    : `Inzira ${ref}: the client uploaded a document. Open the staff console.`;
  sendSoon([await enqueue(tx, { channel: "sms", to: people[0].phone, ref, message: text })]);
}

export async function listStaffAlerts(staffId: string): Promise<StaffAlert[]> {
  const rows = await (await db()).select().from(s.staffNotifications)
    .where(eq(s.staffNotifications.staffId, staffId))
    .orderBy(desc(s.staffNotifications.at), desc(s.staffNotifications.id))
    .limit(30);
  return rows.map((n) => ({
    id: String(n.id), icon: n.icon, title: n.title, body: n.body ?? undefined, href: n.href,
    ref: n.ref ?? undefined, at: iso(n.at)!, unread: n.unread,
  }));
}

export async function unreadStaffAlertCount(staffId: string): Promise<number> {
  const rows = await (await db()).select({ id: s.staffNotifications.id }).from(s.staffNotifications)
    .where(and(eq(s.staffNotifications.staffId, staffId), eq(s.staffNotifications.unread, true)))
    .limit(50);
  return rows.length;
}

export async function markStaffAlertsRead(staffId: string, ids?: string[]) {
  const d = await db();
  if (ids?.length) {
    const nums = ids.map(Number).filter((n) => Number.isInteger(n));
    if (!nums.length) return;
    await d.update(s.staffNotifications).set({ unread: false })
      .where(and(eq(s.staffNotifications.staffId, staffId), inArray(s.staffNotifications.id, nums)));
    return;
  }
  await d.update(s.staffNotifications).set({ unread: false }).where(eq(s.staffNotifications.staffId, staffId));
}
