"use server";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getStaffUser, normalisePhone } from "@/lib/auth";
import { rwf } from "@/lib/format";
import { audit, db, event, fail, notify, s, type Result } from "@/lib/mutate";
import { PERMISSIONS, ROLES, type Permission } from "@/lib/permissions";
import { SITE } from "@/lib/site";
import { sendSms } from "@/lib/sms";
import type { Service, StaffRole } from "@/lib/types";

async function admin(perm: Permission) {
  const me = await getStaffUser();
  if (!me) return { error: "Your session has ended. Sign in again." } as const;
  if (!me.permissions.has(perm)) return { error: `Your role can’t do this (${PERMISSIONS[perm]}).` } as const;
  return { me, d: await db() };
}

/** Creates or updates a catalogue entry, including both fee lines. Every price change is audited. */
export async function saveService(v: Service, isNew = false): Promise<Result> {
  const a = await admin("editServices");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  if (!v.name.trim()) return fail("Give the service a name.");
  if (!/^[a-z0-9-]+$/.test(v.slug)) return fail("The service address can only use lowercase letters, numbers and dashes.");
  if (v.ours < 0 || (v.official.amount !== null && v.official.amount < 0)) return fail("Amounts can’t be negative.");
  const row = {
    slug: v.slug, name: v.name.trim(), aka: v.aka ?? null, category: v.category, authority: v.authority, channel: v.channel, via: v.via || `Via ${v.channel}`, summary: v.summary,
    who: v.who, requirements: v.requirements, documents: v.documents.filter((x) => x.name.trim()), steps: v.steps, notes: v.notes,
    officialAmount: v.official.mode ? (v.official.mode === "none" ? 0 : null) : v.official.amount, officialMode: v.official.mode ?? null, officialLabel: v.official.label ?? null,
    officialNote: v.official.note, officialVerifiedAt: v.official.verifiedAt ?? null, ours: v.ours, oursUnit: v.oursUnit ?? null, time: v.time, docsShort: v.docsShort,
    popular: !!v.popular, audience: v.audience, purposes: v.purposes ?? null, purposeLabel: v.purposeLabel ?? null, noId: !!v.noId, flow: v.flow ?? null, stageLabels: v.stageLabels ?? null,
    visible: v.visible, updatedAt: new Date().toISOString(),
  };
  try { await d.transaction(async (tx) => {
    const [before] = await tx.select().from(s.services).where(eq(s.services.slug, v.slug));
    if (before && isNew) throw new Error("exists");
    if (before) await tx.update(s.services).set(row).where(eq(s.services.slug, v.slug));
    else await tx.insert(s.services).values({ ...row, position: 999 });
    if (!before) await audit(tx, { actor: me.name, role: me.role, action: "Added service", entity: `${row.name} · our fee ${rwf(row.ours)}`, fee: true });
    else {
      if (before.ours !== row.ours || before.oursUnit !== row.oursUnit) await audit(tx, { actor: me.name, role: me.role, action: "Changed assistance fee", entity: `${row.name} · ${rwf(before.ours)}${before.oursUnit ? ` ${before.oursUnit}` : ""} → ${rwf(row.ours)}${row.oursUnit ? ` ${row.oursUnit}` : ""}`, fee: true });
      if (before.officialAmount !== row.officialAmount || before.officialMode !== row.officialMode) await audit(tx, { actor: me.name, role: me.role, action: "Changed official fee", entity: `${row.name}`, fee: true });
      if (before.officialVerifiedAt !== row.officialVerifiedAt && row.officialVerifiedAt) await audit(tx, { actor: me.name, role: me.role, action: "Checked official fee", entity: row.name });
      await audit(tx, { actor: me.name, role: me.role, action: "Edited service", entity: row.name });
    }
  }); } catch (e) {
    if (e instanceof Error && e.message === "exists") return fail("A service with that name already exists. Choose another name.");
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Returns our assistance fee for a request. Official fees already paid are recovered from the institution, not here. */
export async function refund(ref: string): Promise<Result> {
  const a = await admin("refund");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  const paid = await d.select().from(s.transactions).where(and(eq(s.transactions.ref, ref), eq(s.transactions.status, "paid")));
  const ours = paid.reduce((n, t) => n + t.ours, 0);
  if (!ours) return fail("Nothing to refund on this request.");
  await d.transaction(async (tx) => {
    for (const t of paid) await tx.update(s.transactions).set({ status: "refunded" }).where(eq(s.transactions.id, t.id));
    await event(tx, ref, "Assistance fee refunded", me.id, rwf(ours));
    await notify(tx, ref, { icon: "refresh", title: `Refund of ${rwf(ours)} issued for ${ref}`, sms: `we refunded ${rwf(ours)} to the number you paid from.` });
    await audit(tx, { actor: me.name, role: me.role, action: "Issued refund", entity: `${ref} · ${rwf(ours)} ours`, fee: true });
  });
  // The money itself is returned through the payment provider's dashboard until refunds are automated.
  revalidatePath("/admin/payments");
  return { ok: true };
}

export async function savePermissions(matrix: Record<string, boolean[]>): Promise<Result> {
  const a = await admin("manageStaff");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  await d.transaction(async (tx) => {
    for (const perm of Object.keys(PERMISSIONS) as Permission[]) {
      for (const [i, role] of ROLES.entries()) {
        const allowed = role.name === "Owner" ? true : !!matrix[perm]?.[i];
        await tx.insert(s.rolePermissions).values({ role: role.name, permission: perm, allowed })
          .onConflictDoUpdate({ target: [s.rolePermissions.role, s.rolePermissions.permission], set: { allowed } });
      }
    }
    await audit(tx, { actor: me.name, role: me.role, action: "Changed permissions", entity: "Roles matrix" });
  });
  revalidatePath("/admin/roles");
  return { ok: true };
}

export async function inviteStaff(name: string, phoneInput: string, role: StaffRole): Promise<Result> {
  const a = await admin("manageStaff");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  const phone = normalisePhone(phoneInput);
  if (!name.trim()) return fail("Enter their full name.");
  if (!phone) return fail("Enter their Rwandan mobile number.");
  if (role === "Owner") return fail("There is only one owner.");
  const [taken] = await d.select().from(s.staff).where(eq(s.staff.phone, phone));
  if (taken) return fail(`${taken.name} already uses that number.`);
  await d.transaction(async (tx) => {
    await tx.insert(s.staff).values({ id: `s-${randomBytes(5).toString("hex")}`, name: name.trim(), phone, role, team: "—", title: role, active: true });
    await audit(tx, { actor: me.name, role: me.role, action: "Granted role", entity: `${name.trim()} → ${role}` });
  });
  sendSms(phone, `Inzira: ${me.name} added you as ${role}. Sign in with this number at ${SITE.url}/sign-in`).catch((e) => console.error("[sms]", e));
  revalidatePath("/admin/roles");
  return { ok: true };
}

export async function updateStaff(id: string, change: { role?: StaffRole; active?: boolean }): Promise<Result> {
  const a = await admin("manageStaff");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  const [person] = await d.select().from(s.staff).where(eq(s.staff.id, id));
  if (!person) return fail("Person not found.");
  if (person.role === "Owner" || change.role === "Owner") return fail("The owner can’t be changed here.");
  if (person.id === me.id) return fail("You can’t change your own access.");
  await d.transaction(async (tx) => {
    await tx.update(s.staff).set(change).where(eq(s.staff.id, id));
    if (change.active === false) await tx.delete(s.sessions).where(eq(s.sessions.subjectId, id));
    await audit(tx, { actor: me.name, role: me.role, action: change.role ? "Changed role" : change.active ? "Reactivated person" : "Deactivated person", entity: change.role ? `${person.name} → ${change.role}` : person.name });
  });
  revalidatePath("/admin/roles");
  return { ok: true };
}
