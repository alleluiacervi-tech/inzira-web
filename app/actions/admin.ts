"use server";
import { randomBytes } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getStaffUser } from "@/lib/auth";
import { normaliseEmail, normalisePhone } from "@/lib/contact";
import { sendEmail } from "@/lib/email";
import { staffInviteMail, testMail } from "@/lib/mail";
import { rwf } from "@/lib/format";
import { audit, db, event, fail, notify, s, type Result } from "@/lib/mutate";
import { PERMISSIONS, ROLES, type Permission } from "@/lib/permissions";
import { runAndRecord } from "@/lib/jobs";
import { allow } from "@/lib/ratelimit";
import type { Service, StaffRole } from "@/lib/types";

/** The usual steps, for a new service that has none yet. */
const defaultSteps = (channel: string, authority: string): Service["steps"] => [
  { title: "You start the request", body: "Answer a few short questions. Takes about 3 minutes.", you: true },
  { title: "We check your documents", body: "Your agent confirms everything is correct, usually within 2 working hours." },
  { title: "You approve the fees", body: "You see the official fee and our fee separately, then pay by MoMo or Airtel Money.", you: true },
  { title: `We submit via ${channel}`, body: "We submit through the official channel and share the official reference number with you." },
  { title: `${authority} processes it`, body: "The institution reviews and decides. We follow up if it takes longer than usual." },
  { title: "You receive the result", body: "Delivered to your portal, with official receipts." },
];

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
  if (!v.summary.trim()) return fail("Write the “In simple terms” description customers read.");
  if (!v.channel.trim() || !v.authority.trim()) return fail("Fill in the responsible authority and the official channel.");
  if (!/^[a-z0-9-]+$/.test(v.slug)) return fail("The service address can only use lowercase letters, numbers and dashes.");
  if (v.ours < 0 || (v.official.amount !== null && v.official.amount < 0)) return fail("Amounts can’t be negative.");
  const row = {
    slug: v.slug, name: v.name.trim(), aka: v.aka ?? null, category: v.category, authority: v.authority, channel: v.channel, via: v.via || `Via ${v.channel}`, summary: v.summary,
    who: v.who, requirements: v.requirements.filter((x) => x.trim()), documents: v.documents.filter((x) => x.name.trim()), steps: v.steps.length ? v.steps : defaultSteps(v.channel || "the official channel", v.authority || "The institution"), notes: v.notes,
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
    await notify(tx, ref, { icon: "refresh", title: `Refund of ${rwf(ours)} issued for ${ref}`, message: `we refunded ${rwf(ours)} to the number you paid from.` });
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

export async function inviteStaff(name: string, emailInput: string, role: StaffRole, phoneInput = ""): Promise<Result> {
  const a = await admin("manageStaff");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  const email = normaliseEmail(emailInput);
  const phone = phoneInput.trim() ? normalisePhone(phoneInput) : null;
  if (!name.trim()) return fail("Enter their full name.");
  if (!email) return fail("Enter their work email address. They sign in with it.");
  if (phoneInput.trim() && !phone) return fail("That phone number doesn’t look right. Leave it empty if you don’t have it.");
  if (role === "Owner") return fail("There is only one owner.");
  const [taken] = await d.select().from(s.staff).where(email && phone ? or(eq(s.staff.email, email), eq(s.staff.phone, phone)) : eq(s.staff.email, email));
  if (taken) return fail(`${taken.name} already uses ${taken.email === email ? "that email address" : "that phone number"}.`);
  await d.transaction(async (tx) => {
    await tx.insert(s.staff).values({ id: `s-${randomBytes(5).toString("hex")}`, name: name.trim(), email, phone, role, team: "—", title: role, active: true });
    await audit(tx, { actor: me.name, role: me.role, action: "Granted role", entity: `${name.trim()} → ${role}` });
  });
  sendEmail(staffInviteMail(email, name.trim(), me.name, role)).catch((e) => console.error("[email]", e));
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

// ---------------- system ----------------
/** Sends an email to the signed-in person's own address, to check the provider end to end. */
export async function sendTestEmail(): Promise<Result<{ to: string }>> {
  const a = await admin("manageStaff");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  const [row] = await d.select({ email: s.staff.email }).from(s.staff).where(eq(s.staff.id, me.id));
  if (!row?.email) return fail("Your staff profile has no email address.");
  if (!(await allow(`test-email:${me.id}`, 5, 60 * 60e3))) return fail("You’ve sent 5 test emails this hour. Try again later.");
  try {
    await sendEmail(testMail(row.email));
  } catch (e) {
    return fail(`The provider refused the message: ${e instanceof Error ? e.message : "unknown error"}.`);
  }
  await audit(d, { actor: me.name, role: me.role, action: "Sent test email", entity: row.email });
  return { ok: true, to: row.email };
}

/** Runs the scheduled job now, as the daily schedule would. */
export async function runJobNow(): Promise<Result<{ summary: string }>> {
  const a = await admin("manageStaff");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  if (!(await allow(`run-job:${me.id}`, 6, 60 * 60e3))) return fail("The job has run 6 times this hour. Try again later.");
  const r = await runAndRecord();
  await audit(d, { actor: me.name, role: me.role, action: "Ran scheduled job", entity: r.ok ? "OK" : "Failed" });
  revalidatePath("/admin/system");
  if (!r.ok) return fail(`The job failed: ${String((r as { error?: unknown }).error ?? "unknown error")}`);
  const n = (k: string, f: string) => Number(((r as unknown as Record<string, Record<string, unknown> | undefined>)[k] ?? {})[f] ?? 0);
  const parts = ([["payments", "settled", "payment settled", "payments settled"], ["overdue", "held", "overdue request put on hold", "overdue requests put on hold"], ["retention", "deleted", "old document deleted", "old documents deleted"], ["digest", "sent", "staff summary sent", "staff summaries sent"]] as const)
    .map(([k, f, one, many]) => [n(k, f), one, many] as const).filter(([c]) => c > 0).map(([c, one, many]) => `${c} ${c === 1 ? one : many}`);
  return { ok: true, summary: parts.length ? `${parts.join(", ")}.` : "nothing needed doing." };
}
