"use server";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { refundSplit } from "@/lib/status";
import { getStaffUser, normalisePhone } from "@/lib/auth";
import { rwf } from "@/lib/format";
import { msg, sms } from "@/lib/i18n/stored";
import { audit, db, event, fail, notify, s, type Result } from "@/lib/mutate";
import { PERMISSIONS, ROLES, type Permission } from "@/lib/permissions";
import { SITE } from "@/lib/site";
import { enqueue, sendSoon } from "@/lib/outbox";
import { sendSms } from "@/lib/sms";
import { runAndRecord } from "@/lib/jobs";
import { payoutProvider } from "@/lib/payments";
import { PayoutRefused, closeUnclearPayout, reconcilePayout, sendRefund } from "@/lib/payouts";
import { allow } from "@/lib/ratelimit";
import { idPolicyOf } from "@/lib/identity";
import { STAGES, type Service, type StaffRole, type Stage } from "@/lib/types";

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
  if (!Number.isInteger(v.ours) || (v.official.amount !== null && !Number.isInteger(v.official.amount))) return fail("Enter whole amounts in RWF.");
  if (v.ours < 0 || (v.official.amount !== null && v.official.amount < 0)) return fail("Amounts can’t be negative.");
  const policy = idPolicyOf(v);
  const row = {
    slug: v.slug, name: v.name.trim(), aka: v.aka ?? null, tagline: v.tagline?.trim() || null, category: v.category, authority: v.authority, channel: v.channel, via: v.via || `Via ${v.channel}`, summary: v.summary,
    who: v.who, requirements: v.requirements.filter((x) => x.trim()), documents: v.documents.filter((x) => x.name.trim()), steps: v.steps.length ? v.steps : defaultSteps(v.channel || "the official channel", v.authority || "The institution"), notes: v.notes,
    officialAmount: v.official.mode ? (v.official.mode === "none" ? 0 : null) : v.official.amount, officialMode: v.official.mode ?? null, officialLabel: v.official.label ?? null,
    officialNote: v.official.note, officialVerifiedAt: v.official.verifiedAt ?? null, ours: v.ours, oursUnit: v.oursUnit ?? null, time: v.time, docsShort: v.docsShort,
    popular: !!v.popular, audience: v.audience, purposes: v.purposes ?? null, purposeLabel: v.purposeLabel ?? null, noId: policy === "none", idPolicy: policy, flow: v.flow ?? null, stageLabels: v.stageLabels ?? null,
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
      if (before.idPolicy !== row.idPolicy) await audit(tx, { actor: me.name, role: me.role, action: "Changed ID requirement", entity: `${row.name} · ${before.idPolicy} → ${row.idPolicy}` });
      await audit(tx, { actor: me.name, role: me.role, action: "Edited service", entity: row.name });
    }
  }); } catch (e) {
    if (e instanceof Error && e.message === "exists") return fail("A service with that name already exists. Choose another name.");
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Returns what a request paid: our fee, and an official fee we collected but have not paid to the institution yet
 *  (lib/status.ts refundSplit). Official fees already paid are recovered from the institution, not here.
 *  With IntouchPay the money goes back to the number that paid (RequestDeposit, lib/payouts.ts) and the request reads as
 *  refunded once IntouchPay confirms. Without a provider that can send money, staff send it themselves and this records it. */
export async function refund(ref: string): Promise<Result<{ outcome: "sent" | "pending" | "recorded"; amount: number }>> {
  const a = await admin("refund");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  if (payoutProvider()) {
    try {
      const r = await sendRefund(ref, me);
      revalidatePath("/admin/payments");
      return { ok: true, outcome: r.status, amount: r.amount };
    } catch (e) {
      if (e instanceof PayoutRefused) return fail(e.message);
      throw e;
    }
  }
  const paid = await d.select().from(s.transactions).where(and(eq(s.transactions.ref, ref), eq(s.transactions.status, "paid")));
  const [req] = await d.select({ officialReceipt: s.requests.officialReceipt }).from(s.requests).where(eq(s.requests.ref, ref));
  const back = refundSplit({ transactions: paid, officialReceipt: req?.officialReceipt ?? "na" });
  const ours = back.total;
  if (!ours) return fail("Nothing to refund on this request.");
  await d.transaction(async (tx) => {
    for (const t of paid) await tx.update(s.transactions).set({ status: "refunded" }).where(eq(s.transactions.id, t.id));
    await event(tx, ref, msg("ev.refunded", { amount: rwf(ours) }), me.id);
    await notify(tx, ref, { icon: "refresh", title: msg("nt.refund", { amount: rwf(ours), ref }), sms: sms("refund", { amount: rwf(ours) }) });
    await audit(tx, { actor: me.name, role: me.role, action: "Issued refund", entity: `${ref} · ${rwf(ours)}${back.official ? ` (official ${rwf(back.official)} not yet paid out)` : ""} · sent by hand`, fee: true });
  });
  revalidatePath("/admin/payments");
  return { ok: true, outcome: "recorded", amount: ours };
}

/** Asks IntouchPay again about a refund it did not clearly answer. */
export async function checkRefund(payoutId: number): Promise<Result<{ status: "sent" | "pending" | "failed" }>> {
  const a = await admin("refund");
  if ("error" in a) return fail(a.error!);
  const status = await reconcilePayout(payoutId);
  revalidatePath("/admin/payments");
  return { ok: true, status };
}

/** Closes a refund IntouchPay never answered, once staff have seen in its portal that it was not sent. */
export async function closeUnclearRefund(payoutId: number): Promise<Result> {
  const a = await admin("refund");
  if ("error" in a) return fail(a.error!);
  if (!(await closeUnclearPayout(payoutId, a.me))) return fail("This refund can be checked with IntouchPay; use Check again.");
  revalidatePath("/admin/payments");
  return { ok: true };
}

/** Only the Owner decides what each role may do, and who holds the Administrator role. Otherwise an Administrator
 *  could give themselves or a friend every permission. */
const OWNER_ONLY = "Only the owner can do this.";
const needsOwner = (role: string | undefined) => role === "Owner" || role === "Administrator";

export async function savePermissions(matrix: Record<string, boolean[]>): Promise<Result> {
  const a = await admin("manageStaff");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  if (me.role !== "Owner") return fail(OWNER_ONLY);
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
  if (needsOwner(role) && me.role !== "Owner") return fail(OWNER_ONLY);
  const [taken] = await d.select().from(s.staff).where(eq(s.staff.phone, phone));
  if (taken) return fail(`${taken.name} already uses that number.`);
  const queued = await d.transaction(async (tx) => {
    await tx.insert(s.staff).values({ id: `s-${randomBytes(5).toString("hex")}`, name: name.trim(), phone, role, team: "—", title: role, active: true });
    await audit(tx, { actor: me.name, role: me.role, action: "Granted role", entity: `${name.trim()} → ${role}` });
    return enqueue(tx, { channel: "sms", to: phone, message: `Inzira: ${me.name} added you as ${role}. Sign in with this number at ${SITE.url}/sign-in` });
  });
  sendSoon([queued]);
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
  if (me.role !== "Owner" && (needsOwner(person.role) || needsOwner(change.role))) return fail(OWNER_ONLY);
  await d.transaction(async (tx) => {
    await tx.update(s.staff).set(change).where(eq(s.staff.id, id));
    if (change.active === false) await tx.delete(s.sessions).where(eq(s.sessions.subjectId, id));
    await audit(tx, { actor: me.name, role: me.role, action: change.role ? "Changed role" : change.active ? "Reactivated person" : "Deactivated person", entity: change.role ? `${person.name} → ${change.role}` : person.name });
  });
  revalidatePath("/admin/roles");
  return { ok: true };
}

/** For a colleague who lost their phone and their recovery codes: the owner removes their authenticator step so they can
 *  sign in by SMS and set it up again. Only the owner, and every use is logged. */
export async function resetStaffTotp(id: string): Promise<Result> {
  const a = await admin("manageStaff");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  if (me.role !== "Owner") return fail(OWNER_ONLY);
  const [person] = await d.select().from(s.staff).where(eq(s.staff.id, id));
  if (!person) return fail("Person not found.");
  await d.transaction(async (tx) => {
    await tx.update(s.staff).set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecovery: null }).where(eq(s.staff.id, id));
    await tx.delete(s.sessions).where(eq(s.sessions.subjectId, id));
    await audit(tx, { actor: me.name, role: me.role, action: "Reset authenticator step", entity: person.name });
  });
  revalidatePath("/admin/roles");
  return { ok: true };
}

// ---------------- system ----------------
/** Sends an SMS to the signed-in person's own phone, to check the provider end to end. */
export async function sendTestSms(): Promise<Result<{ to: string }>> {
  const a = await admin("manageStaff");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  const [row] = await d.select({ phone: s.staff.phone }).from(s.staff).where(eq(s.staff.id, me.id));
  if (!row?.phone) return fail("Your staff profile has no phone number.");
  if (!(await allow(`test-sms:${me.id}`, 5, 60 * 60e3))) return fail("You’ve sent 5 test messages this hour. Try again later.");
  try {
    await sendSms(row.phone, `Inzira test: SMS is working. Sent ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Kigali" })} Kigali time.`);
  } catch (e) {
    return fail(`The provider refused the message: ${e instanceof Error ? e.message : "unknown error"}.`);
  }
  await audit(d, { actor: me.name, role: me.role, action: "Sent test SMS", entity: `+250 ${row.phone}` });
  return { ok: true, to: `+250 ${row.phone.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")}` };
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

/** Hours a case may stay in each stage before it is late. Zero means no clock. */
export async function saveStageTargets(hours: Partial<Record<Stage, number>>): Promise<Result> {
  const a = await admin("manageStaff");
  if ("error" in a) return fail(a.error!);
  const rows = STAGES.map((stage) => {
    const n = Number(hours[stage]);
    return { stage, targetHours: Number.isFinite(n) && n >= 0 ? Math.round(n) : null };
  });
  if (rows.some((r) => r.targetHours === null)) return fail("Stage targets must be zero or a number of hours.");
  await a.d.transaction(async (tx) => {
    for (const r of rows) {
      await tx.insert(s.stageTargets).values({ stage: r.stage, targetHours: r.targetHours!, updatedAt: new Date().toISOString() })
        .onConflictDoUpdate({ target: s.stageTargets.stage, set: { targetHours: r.targetHours!, updatedAt: new Date().toISOString() } });
    }
    await audit(tx, { actor: a.me.name, role: a.me.role, action: "Updated stage targets", entity: rows.map((r) => `${r.stage} ${r.targetHours}h`).join(", ") });
  });
  revalidatePath("/admin/system");
  revalidatePath("/console", "layout");
  return { ok: true };
}
