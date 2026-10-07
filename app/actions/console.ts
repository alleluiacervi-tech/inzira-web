"use server";
import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getStaffUser } from "@/lib/auth";
import { normaliseEmail, normalisePhone } from "@/lib/contact";
import { rwf, shortName } from "@/lib/format";
import { audit, db, event, fail, notify, s, type Result } from "@/lib/mutate";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { searchGlobal } from "@/lib/repo";
import type { Closed, PayMethod, SavedView, Stage } from "@/lib/types";

const now = () => new Date().toISOString();

async function staffAction(perm?: Permission) {
  const me = await getStaffUser();
  if (!me) return { error: "Your session has ended. Sign in again." } as const;
  if (perm && !me.permissions.has(perm)) return { error: `Your role can’t do this (${PERMISSIONS[perm]}).` } as const;
  return { me, d: await db() };
}

export async function searchConsole(q: string) {
  const a = await staffAction("viewAssigned");
  if ("error" in a) return { requests: [], clients: [], services: [] };
  return searchGlobal(q);
}

// ---------------- Inbox & Triage ----------------
export async function acceptAndAssignRequest(ref: string, agentId: string, message?: string): Promise<Result> {
  const a = await staffAction("assign");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;

  const [agent] = await d.select().from(s.staff).where(eq(s.staff.id, agentId));
  if (!agent) return fail("Agent not found.");

  const [req] = await d.select().from(s.requests).where(eq(s.requests.ref, ref));
  if (!req) return fail("Request not found.");

  await d.transaction(async (tx) => {
    const nextStage = req.stage === "received" ? "checking" : req.stage;
    const stageDates = { ...req.stageDates, [nextStage]: req.stageDates[nextStage] ?? now() };
    
    await tx.update(s.requests).set({
      agentId,
      stage: nextStage,
      stageDates,
      summary: {
        title: `${shortName(agent.name)} is working on your request`,
        body: message?.trim() || `${shortName(agent.name)} is checking your documents and preparing the submission.`,
      },
      next: `${shortName(agent.name)} is checking your request.`,
    }).where(eq(s.requests.ref, ref));

    await event(tx, ref, `Accepted and assigned to ${agent.name}`, me.id, message?.trim() || undefined);
    await notify(tx, ref, {
      icon: "user",
      title: `${agent.name.split(" ")[0]} has taken your request ${ref}`,
      message: `${agent.name.split(" ")[0]} is handling your request ${ref}. See progress in your portal.`,
    });
    await audit(tx, { actor: me.name, role: me.role, action: "Accepted & assigned case", entity: `${ref} → ${agent.name}` });
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function declineRequest(ref: string, reason: string): Promise<Result> {
  const a = await staffAction("complete");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;

  if (!reason.trim()) return fail("Write the reason the customer will see.");

  const closed: Closed = { kind: "rejected", at: now(), reason: reason.trim() };
  await d.transaction(async (tx) => {
    await tx.update(s.requests).set({
      closed,
      hold: null,
      summary: { title: "Request declined", body: reason.trim() },
      next: "Declined.",
    }).where(eq(s.requests.ref, ref));

    await event(tx, ref, "Request declined", me.id, reason.trim());
    await notify(tx, ref, {
      icon: "alert",
      title: `Request ${ref} was declined`,
      message: `your request ${ref} was declined: ${reason.trim()}`,
    });
    await audit(tx, { actor: me.name, role: me.role, action: "Declined request", entity: `${ref} · ${reason.trim()}` });
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function quoteCustomRequest(ref: string, official: number | null, ours: number, note?: string): Promise<Result> {
  const a = await staffAction("recordOfficial");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;

  if (ours <= 0) return fail("Set our assistance fee first.");
  if (official !== null && official < 0) return fail("Official fee cannot be negative.");

  const [req] = await d.select().from(s.requests).where(eq(s.requests.ref, ref));
  if (!req) return fail("Request not found.");

  await d.transaction(async (tx) => {
    const dueAt = new Date(Date.now() + 3 * 864e5).toISOString();
    await tx.update(s.requests).set({
      official,
      ours,
      oursNote: note?.trim() || null,
      quote: "confirmed",
      dueAt,
    }).where(eq(s.requests.ref, ref));

    const officialText = req.officialMode === "none" ? "no official fee" : req.officialMode === "direct" ? "official fee paid directly" : `official ${rwf(official ?? 0)}`;
    await event(tx, ref, "Quote prepared & sent", me.id, `${officialText} + our fee ${rwf(ours)}`);
    await notify(tx, ref, {
      icon: "card",
      title: `Quote ready for ${ref}: ${officialText} + our fee ${rwf(ours)}`,
      message: `quote ready: ${officialText} + our fee ${rwf(ours)}. Review and approve in your portal.`,
    });
    await audit(tx, { actor: me.name, role: me.role, action: "Sent custom quote", entity: `${ref} · ${officialText} + ${rwf(ours)}`, fee: true });
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------- Bulk Actions ----------------
export async function bulkAssignRequests(refs: string[], agentId: string | null): Promise<Result> {
  const a = await staffAction("assign");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;

  if (!refs.length) return fail("Select at least one request.");

  const [agent] = agentId ? await d.select().from(s.staff).where(eq(s.staff.id, agentId)) : [null];
  if (agentId && !agent) return fail("Agent not found.");

  await d.transaction(async (tx) => {
    for (const ref of refs) {
      await tx.update(s.requests).set({ agentId }).where(eq(s.requests.ref, ref));
      await event(tx, ref, agent ? `Assigned to ${agent.name}` : "Unassigned", me.id);
      await audit(tx, { actor: me.name, role: me.role, action: "Bulk assigned case", entity: `${ref} → ${agent?.name ?? "nobody"}` });
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function bulkMessageRequests(refs: string[], body: string): Promise<Result> {
  const a = await staffAction("viewAssigned");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;

  if (!refs.length) return fail("Select at least one request.");
  if (!body.trim()) return fail("Write a message first.");

  await d.transaction(async (tx) => {
    for (const ref of refs) {
      await tx.insert(s.messages).values({ ref, by: me.id, body: body.trim() });
      await notify(tx, ref, { icon: "msg", title: `${me.name.split(" ")[0]}: “${body.trim().slice(0, 90)}”` });
      await audit(tx, { actor: me.name, role: me.role, action: "Bulk messaged customer", entity: ref });
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------- Manual Payments ("Record by hand") ----------------
export async function recordManualPayment(input: {
  ref: string;
  method: PayMethod;
  official: number;
  ours: number;
  receipt: string;
  payer?: string;
  notes?: string;
}): Promise<Result> {
  const a = await staffAction("recordOfficial");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;

  const ref = input.ref.trim().toUpperCase();
  const [req] = await d.select().from(s.requests).where(eq(s.requests.ref, ref));
  if (!req) return fail("Request not found.");

  if (!input.receipt.trim()) return fail("Enter a receipt or transaction reference number.");
  if (input.official < 0 || input.ours < 0) return fail("Amounts cannot be negative.");
  if (input.official === 0 && input.ours === 0) return fail("Total payment amount must be greater than 0.");

  await d.transaction(async (tx) => {
    await tx.insert(s.transactions).values({
      ref,
      receipt: input.receipt.trim(),
      method: input.method,
      official: input.official,
      ours: input.ours,
      status: "paid",
      payer: input.payer?.trim() || null,
      providerRef: input.receipt.trim(),
      at: now(),
    });

    const total = input.official + input.ours;
    await event(tx, ref, `Payment recorded (${input.method})`, me.id, `Total ${rwf(total)} (Inzira ${rwf(input.ours)}, Official ${rwf(input.official)}) · Ref: ${input.receipt.trim()}`);
    await notify(tx, ref, {
      icon: "card",
      title: `Payment of ${rwf(total)} received for ${ref}`,
      message: `we received your payment of ${rwf(total)} for ${ref}. Official receipt: ${input.receipt.trim()}.`,
    });
    await audit(tx, {
      actor: me.name,
      role: me.role,
      action: "Recorded payment by hand",
      entity: `${ref} · ${input.method} · Total ${rwf(total)} (Inzira: ${rwf(input.ours)}, Official: ${rwf(input.official)}) · Receipt: ${input.receipt.trim()}`,
      fee: true,
    });
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------- Privacy & Audited Reveals ----------------
export async function revealNationalId(profileId: string): Promise<Result<{ nationalId: string }>> {
  const a = await staffAction("viewAssigned");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;

  const [prof] = await d.select().from(s.profiles).where(eq(s.profiles.id, profileId));
  if (!prof) return fail("Profile not found.");

  await audit(d, {
    actor: me.name,
    role: me.role,
    action: "Viewed unmasked National ID",
    entity: `Client ${prof.name} (${prof.id})`,
  });

  return { ok: true, nationalId: prof.nationalId || prof.idMasked || "—" };
}

export async function revealTin(profileId: string): Promise<Result<{ tin: string }>> {
  const a = await staffAction("viewAssigned");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;

  const [prof] = await d.select().from(s.profiles).where(eq(s.profiles.id, profileId));
  if (!prof) return fail("Profile not found.");

  await audit(d, {
    actor: me.name,
    role: me.role,
    action: "Viewed unmasked TIN",
    entity: `Client ${prof.name} (${prof.id})`,
  });

  return { ok: true, tin: prof.tin || prof.tinMasked || "—" };
}

// ---------------- Client Management ----------------
export async function createClient(input: {
  name: string;
  phone: string;
  email?: string;
  kind: "person" | "business" | "organization";
  district?: string;
  nationalId?: string;
  tin?: string;
  tags?: string[];
  notes?: string;
}): Promise<Result<{ profileId: string }>> {
  const a = await staffAction("manageStaff");
  const me = a.me ?? (await getStaffUser());
  if (!me) return fail("Your session has ended. Sign in again.");

  const phone = normalisePhone(input.phone);
  if (!input.name.trim()) return fail("Enter client's full name.");
  if (!phone) return fail("Enter a Rwandan mobile number (e.g. 788 123 456).");
  const email = input.email?.trim() ? normaliseEmail(input.email) : null;
  if (input.email?.trim() && !email) return fail("That email address doesn’t look right.");

  const d = await db();
  const res = await d.transaction(async (tx) => {
    let [account] = await tx.select().from(s.accounts).where(email ? eq(s.accounts.email, email) : eq(s.accounts.phone, phone));
    if (!account) {
      [account] = await tx.insert(s.accounts).values({
        id: `acc-${randomBytes(6).toString("hex")}`,
        name: input.name.trim(),
        first: input.name.trim().split(" ")[0],
        phone,
        email,
        languages: ["Kinyarwanda"],
      }).returning();
    }

    const nationalId = input.nationalId?.trim() || null;
    const idMasked = nationalId ? `${nationalId.slice(0, 7)} •••• ${nationalId.slice(-4)}` : null;
    const tin = input.tin?.trim() || null;
    const tinMasked = tin ? `${tin.slice(0, 3)} ••• ${tin.slice(-3)}` : null;

    const [profile] = await tx.insert(s.profiles).values({
      id: `p-${randomBytes(6).toString("hex")}`,
      accountId: account.id,
      kind: input.kind,
      name: input.name.trim(),
      relation: input.kind === "person" ? "self" : null,
      district: input.district?.trim() || null,
      nationalId,
      idMasked,
      tin,
      tinMasked,
    }).returning();

    if (input.tags?.length) {
      await tx.insert(s.clientTags).values(input.tags.map((tag) => ({ profileId: profile.id, tag: tag.trim() })));
    }

    if (input.notes?.trim()) {
      await tx.insert(s.clientNotes).values({ profileId: profile.id, by: me.id, body: input.notes.trim() });
    }

    await audit(tx, { actor: me.name, role: me.role, action: "Added client", entity: `${profile.name} · ${phone}` });
    return profile.id;
  });

  revalidatePath("/", "layout");
  return { ok: true, profileId: res };
}

export async function addClientTag(profileId: string, tag: string): Promise<Result> {
  const me = await getStaffUser();
  if (!me) return fail("Your session has ended.");
  if (!tag.trim()) return fail("Enter tag text.");

  const d = await db();
  await d.insert(s.clientTags).values({ profileId, tag: tag.trim() });
  await audit(d, { actor: me.name, role: me.role, action: "Added client tag", entity: `${profileId} · ${tag.trim()}` });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeClientTag(profileId: string, tag: string): Promise<Result> {
  const me = await getStaffUser();
  if (!me) return fail("Your session has ended.");

  const d = await db();
  await d.delete(s.clientTags).where(and(eq(s.clientTags.profileId, profileId), eq(s.clientTags.tag, tag)));
  await audit(d, { actor: me.name, role: me.role, action: "Removed client tag", entity: `${profileId} · ${tag}` });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function addClientNote(profileId: string, body: string): Promise<Result> {
  const me = await getStaffUser();
  if (!me) return fail("Your session has ended.");
  if (!body.trim()) return fail("Write a note first.");

  const d = await db();
  await d.insert(s.clientNotes).values({ profileId, by: me.id, body: body.trim() });
  await audit(d, { actor: me.name, role: me.role, action: "Added client note", entity: profileId });
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------- Saved Views ----------------
export async function saveSavedView(input: {
  entity: "requests" | "clients";
  name: string;
  filters: Record<string, unknown>;
  columns?: string[];
  sort?: { col: string; dir: "asc" | "desc" };
}): Promise<Result<{ id: string }>> {
  const me = await getStaffUser();
  if (!me) return fail("Your session has ended.");
  if (!input.name.trim()) return fail("Give the view a name.");

  const d = await db();
  const id = `sv-${randomBytes(5).toString("hex")}`;
  await d.insert(s.savedViews).values({
    id,
    entity: input.entity,
    name: input.name.trim(),
    filters: input.filters,
    columns: input.columns,
    sort: input.sort,
    staffId: me.id,
    isDefault: false,
  });

  await audit(d, { actor: me.name, role: me.role, action: "Saved custom view", entity: `${input.entity} · ${input.name}` });
  revalidatePath("/", "layout");
  return { ok: true, id };
}

export async function deleteSavedView(id: string): Promise<Result> {
  const me = await getStaffUser();
  if (!me) return fail("Your session has ended.");

  const d = await db();
  await d.delete(s.savedViews).where(eq(s.savedViews.id, id));
  await audit(d, { actor: me.name, role: me.role, action: "Deleted saved view", entity: id });
  revalidatePath("/", "layout");
  return { ok: true };
}
