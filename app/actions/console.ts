"use server";
import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { WORKS_CASES, assignableStaff, canSeeCase, canSeeClient, seesAllCases } from "@/lib/access";
import { getStaffUser, normalisePhone } from "@/lib/auth";
import { maskNationalId, maskTin, rwf, shortName } from "@/lib/format";
import { english, feeVars, msg, sms } from "@/lib/i18n/stored";
import { audit, db, event, fail, notify, s, type Result } from "@/lib/mutate";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { searchGlobal } from "@/lib/repo";
import type { Closed, PayMethod } from "@/lib/types";

const now = () => new Date().toISOString();
const NOT_FOUND = "Request not found.";

async function staffAction(perm?: Permission) {
  const me = await getStaffUser();
  if (!me) return { error: "Your session has ended. Sign in again." } as const;
  if (perm && !me.permissions.has(perm)) return { error: `Your role can’t do this (${PERMISSIONS[perm]}).` } as const;
  return { me, d: await db() };
}

/** A staff action on one case: they need `perm` and must be allowed to see the case. */
async function caseAction(ref: string, perm: Permission) {
  const a = await staffAction(perm);
  if ("error" in a) return { error: a.error! } as const;
  const [req] = await a.d.select().from(s.requests).where(eq(s.requests.ref, ref));
  if (!req || !canSeeCase(a.me, req)) return { error: NOT_FOUND } as const;
  return { ...a, req };
}

/** A staff action on several cases at once: refused unless they may see every one of them. */
async function casesAction(refs: string[], perm: Permission) {
  const a = await staffAction(perm);
  if ("error" in a) return { error: a.error! } as const;
  const unique = [...new Set(refs)];
  if (!unique.length) return { error: "Select at least one request." } as const;
  const rows = await a.d.select().from(s.requests).where(inArray(s.requests.ref, unique));
  if (rows.length !== unique.length || !rows.every((r) => canSeeCase(a.me, r))) return { error: "Some of the selected requests were not found. Refresh and try again." } as const;
  return { ...a, refs: unique };
}

/** A staff action on a client's file: they need `perm` and must be allowed to see the client. */
async function clientAction(profileId: string, perm: Permission) {
  const a = await staffAction(perm);
  if ("error" in a) return { error: a.error! } as const;
  const [profile] = await a.d.select().from(s.profiles).where(eq(s.profiles.id, profileId));
  if (!profile || !(await canSeeClient(a.d, a.me, profileId))) return { error: "Client not found." } as const;
  return { ...a, profile };
}

/** The active member of staff to hand a case to, or null. */
const assignee = assignableStaff;

export async function searchConsole(q: string) {
  const a = await staffAction("viewAssigned");
  if ("error" in a) return { requests: [], clients: [], services: [] };
  return searchGlobal(q);
}

// ---------------- Inbox & Triage ----------------
export async function acceptAndAssignRequest(ref: string, agentId: string, message?: string): Promise<Result> {
  const a = await caseAction(ref, "assign");
  if ("error" in a) return fail(a.error!);
  const { me, d, req } = a;
  if (req.closed) return fail("This request is closed.");

  const agent = await assignee(d, agentId);
  if (!agent) return fail("That person can’t take cases.");

  await d.transaction(async (tx) => {
    const nextStage = req.stage === "received" ? "checking" : req.stage;
    const stageDates = { ...req.stageDates, [nextStage]: req.stageDates[nextStage] ?? now() };

    // A message from the person assigning replaces our standard body, as they wrote it.
    const own = message?.trim();
    const summary = msg(own ? "sum.takenOwnWords" : "sum.taken", { agent: shortName(agent.name) });
    await tx.update(s.requests).set({
      agentId,
      stage: nextStage,
      stageDates,
      summary: { title: english(summary, "title"), body: own || english(summary, "body"), msg: summary },
      next: english(summary, "next"),
    }).where(eq(s.requests.ref, ref));

    await event(tx, ref, msg("ev.acceptedAssigned", { name: agent.name }), me.id, own || undefined);
    const first = agent.name.split(" ")[0];
    await notify(tx, ref, { icon: "user", title: msg("nt.taken", { agent: first, ref }), sms: sms("taken", { agent: first, ref }) });
    await audit(tx, { actor: me.name, role: me.role, action: "Accepted & assigned case", entity: `${ref} → ${agent.name}` });
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function declineRequest(ref: string, reason: string): Promise<Result> {
  const a = await caseAction(ref, "complete");
  if ("error" in a) return fail(a.error!);
  const { me, d, req } = a;

  if (req.closed || req.stage === "completed") return fail("This request is already finished.");
  if (!reason.trim()) return fail("Write the reason the customer will see.");

  const closed: Closed = { kind: "rejected", at: now(), reason: reason.trim() };
  const summary = msg("sum.declined");
  await d.transaction(async (tx) => {
    await tx.update(s.requests).set({
      closed,
      hold: null,
      summary: { title: english(summary, "title"), body: reason.trim(), msg: summary },
      next: english(summary, "next"),
    }).where(eq(s.requests.ref, ref));

    await event(tx, ref, msg("ev.declined"), me.id, reason.trim());
    await notify(tx, ref, { icon: "alert", title: msg("nt.declined", { ref }), sms: sms("declined", { ref, reason: reason.trim() }) });
    await audit(tx, { actor: me.name, role: me.role, action: "Declined request", entity: `${ref} · ${reason.trim()}` });
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Sets both fee lines and sends them to the customer. Same rules as saving fees on the case page. */
export async function quoteCustomRequest(ref: string, official: number | null, ours: number, note?: string): Promise<Result> {
  const a = await caseAction(ref, "recordOfficial");
  if ("error" in a) return fail(a.error!);
  const { me, d, req } = a;

  if (req.closed || req.stage === "completed") return fail("This request is already finished.");
  if (ours <= 0) return fail("Set our assistance fee first.");
  if (ours !== req.ours && !me.permissions.has("changeOurs")) return fail("Changing our fee needs a supervisor. Ask one to change it on this case.");
  if (official !== null && official < 0) return fail("Official fee cannot be negative.");
  // When the institution is paid directly, or charges nothing, there is no official amount to record.
  const officialAmount = req.officialMode ? null : official;
  if (!req.officialMode && officialAmount === null) return fail("Record the official fee for this request first.");

  await d.transaction(async (tx) => {
    const dueAt = new Date(Date.now() + 3 * 864e5).toISOString();
    await tx.update(s.requests).set({
      official: officialAmount,
      ours,
      oursNote: note?.trim() || null,
      quote: "confirmed",
      dueAt,
    }).where(eq(s.requests.ref, ref));

    // The same messages as sending fees from the case page.
    const fees = { ...feeVars(req.officialMode, officialAmount), ours: rwf(ours) };
    await event(tx, ref, msg("ev.feesConfirmed", fees), me.id);
    await notify(tx, ref, { icon: "card", title: msg("nt.fees", { ref, ...fees }), sms: sms("fees", fees) });
    await audit(tx, { actor: me.name, role: me.role, action: "Sent custom quote", entity: `${ref} · ${english(msg("ev.feesConfirmed", fees), "body")}`, fee: true });
    if (ours !== req.ours) await audit(tx, { actor: me.name, role: me.role, action: "Changed assistance fee on a case", entity: `${ref} · ${rwf(req.ours)} → ${rwf(ours)}`, fee: true });
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------- Bulk Actions ----------------
export async function bulkAssignRequests(refs: string[], agentId: string | null): Promise<Result> {
  const a = await casesAction(refs, "assign");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;

  const agent = agentId ? await assignee(d, agentId) : null;
  if (agentId && !agent) return fail("That person can’t take cases.");

  await d.transaction(async (tx) => {
    for (const ref of a.refs) {
      await tx.update(s.requests).set({ agentId }).where(eq(s.requests.ref, ref));
      await event(tx, ref, agent ? msg("ev.assigned", { name: agent.name }) : msg("ev.unassigned"), me.id);
      await audit(tx, { actor: me.name, role: me.role, action: "Bulk assigned case", entity: `${ref} → ${agent?.name ?? "nobody"}` });
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function bulkMessageRequests(refs: string[], body: string): Promise<Result> {
  if (!body.trim()) return fail("Write a message first.");
  const a = await casesAction(refs, "viewAssigned");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;

  await d.transaction(async (tx) => {
    for (const ref of a.refs) {
      await tx.insert(s.messages).values({ ref, by: me.id, body: body.trim() });
      await notify(tx, ref, { icon: "msg", title: msg("nt.agentMessage", { agent: me.name.split(" ")[0], excerpt: body.trim().slice(0, 90) }) });
      await audit(tx, { actor: me.name, role: me.role, action: "Bulk messaged customer", entity: ref });
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------- Manual Payments ("Record by hand") ----------------
/** Cash, bank transfers and the like, taken outside the mobile money prompt. Never more than is due. */
export async function recordManualPayment(input: {
  ref: string;
  method: PayMethod;
  official: number;
  ours: number;
  receipt: string;
  payer?: string;
  notes?: string;
}): Promise<Result> {
  const ref = input.ref.trim().toUpperCase();
  const a = await caseAction(ref, "recordOfficial");
  if ("error" in a) return fail(a.error!);
  const { me, d, req } = a;

  if (req.closed) return fail("This request is closed.");
  if (!input.receipt.trim()) return fail("Enter a receipt or transaction reference number.");
  if (!Number.isInteger(input.official) || !Number.isInteger(input.ours)) return fail("Enter whole amounts in RWF.");
  if (input.official < 0 || input.ours < 0) return fail("Amounts cannot be negative.");
  if (input.official === 0 && input.ours === 0) return fail("Total payment amount must be greater than 0.");

  const txs = await d.select().from(s.transactions).where(eq(s.transactions.ref, ref));
  if (txs.some((t) => t.status === "pending")) return fail("A mobile money prompt is still open on this request. Wait for it to finish before recording a payment by hand.");
  const paid = txs.filter((t) => t.status === "paid");
  const officialDue = Math.max(0, (req.official ?? 0) - paid.reduce((n, t) => n + t.official, 0));
  const oursDue = Math.max(0, req.ours - paid.reduce((n, t) => n + t.ours, 0));
  if (input.official > officialDue || input.ours > oursDue) {
    return fail(officialDue + oursDue === 0 ? "Nothing is due on this request." : `That is more than is due: official ${rwf(officialDue)}, our fee ${rwf(oursDue)}.`);
  }

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
    if (req.hold?.reason === "payment") await tx.update(s.requests).set({ hold: null }).where(eq(s.requests.ref, ref));

    const total = input.official + input.ours;
    const paid = { method: input.method, total: rwf(total), ours: rwf(input.ours), official: rwf(input.official), receipt: input.receipt.trim(), ref };
    await event(tx, ref, msg("ev.paymentRecorded", paid), me.id);
    await notify(tx, ref, { icon: "card", title: msg("nt.paymentRecorded", paid), sms: sms("paymentRecorded", paid) });
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
  const a = await clientAction(profileId, "viewIdentity");
  if ("error" in a) return fail(a.error!);
  const { me, d, profile: prof } = a;

  await audit(d, {
    actor: me.name,
    role: me.role,
    action: "Viewed unmasked National ID",
    entity: `Client ${prof.name} (${prof.id})`,
  });

  return { ok: true, nationalId: prof.nationalId || prof.idMasked || "—" };
}

export async function revealTin(profileId: string): Promise<Result<{ tin: string }>> {
  const a = await clientAction(profileId, "viewIdentity");
  if ("error" in a) return fail(a.error!);
  const { me, d, profile: prof } = a;

  await audit(d, {
    actor: me.name,
    role: me.role,
    action: "Viewed unmasked TIN",
    entity: `Client ${prof.name} (${prof.id})`,
  });

  return { ok: true, tin: prof.tin || prof.tinMasked || "—" };
}

// ---------------- Client Management ----------------
/** Adds a client without a case. Agents add customers through New intake, which opens their first case. */
export async function createClient(input: {
  name: string;
  phone: string;
  kind: "person" | "business" | "organization";
  district?: string;
  nationalId?: string;
  tin?: string;
  tags?: string[];
  notes?: string;
}): Promise<Result<{ profileId: string }>> {
  const a = await staffAction(WORKS_CASES);
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  if (!seesAllCases(me)) return fail("Add new customers through New intake: it opens their first case, and the client appears in your list.");

  const phone = normalisePhone(input.phone);
  if (!input.name.trim()) return fail("Enter client's full name.");
  if (!phone) return fail("Enter a Rwandan mobile number (e.g. 788 123 456).");
  const nationalId = input.nationalId?.replace(/\D/g, "") || null;
  if (nationalId && nationalId.length !== 16) return fail("A national ID has 16 digits.");
  const tin = input.tin?.replace(/\D/g, "") || null;
  if (tin && tin.length !== 9) return fail("A TIN has 9 digits.");

  const res = await d.transaction(async (tx) => {
    let [account] = await tx.select().from(s.accounts).where(eq(s.accounts.phone, phone));
    if (!account) {
      [account] = await tx.insert(s.accounts).values({
        id: `acc-${randomBytes(6).toString("hex")}`,
        name: input.name.trim(),
        first: input.name.trim().split(" ")[0],
        phone,
        languages: ["Kinyarwanda"],
      }).returning();
    }

    const [profile] = await tx.insert(s.profiles).values({
      id: `p-${randomBytes(6).toString("hex")}`,
      accountId: account.id,
      kind: input.kind,
      name: input.name.trim(),
      relation: input.kind === "person" ? "self" : null,
      district: input.district?.trim() || null,
      nationalId,
      idMasked: nationalId && maskNationalId(nationalId),
      tin,
      tinMasked: tin && maskTin(tin),
    }).returning();

    const tags = (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
    if (tags.length) {
      await tx.insert(s.clientTags).values(tags.map((tag) => ({ profileId: profile.id, tag })));
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
  if (!tag.trim()) return fail("Enter tag text.");
  const a = await clientAction(profileId, WORKS_CASES);
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;

  await d.insert(s.clientTags).values({ profileId, tag: tag.trim() });
  await audit(d, { actor: me.name, role: me.role, action: "Added client tag", entity: `${profileId} · ${tag.trim()}` });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeClientTag(profileId: string, tag: string): Promise<Result> {
  const a = await clientAction(profileId, WORKS_CASES);
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;

  await d.delete(s.clientTags).where(and(eq(s.clientTags.profileId, profileId), eq(s.clientTags.tag, tag)));
  await audit(d, { actor: me.name, role: me.role, action: "Removed client tag", entity: `${profileId} · ${tag}` });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function addClientNote(profileId: string, body: string): Promise<Result> {
  if (!body.trim()) return fail("Write a note first.");
  const a = await clientAction(profileId, WORKS_CASES);
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;

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

/** Deletes one of your own saved views. The shared views need "Manage agents & roles". */
export async function deleteSavedView(id: string): Promise<Result> {
  const me = await getStaffUser();
  if (!me) return fail("Your session has ended.");

  const d = await db();
  const [view] = await d.select().from(s.savedViews).where(eq(s.savedViews.id, id));
  if (!view || (view.staffId ? view.staffId !== me.id : !me.permissions.has("manageStaff"))) return fail("View not found.");
  await d.delete(s.savedViews).where(eq(s.savedViews.id, id));
  await audit(d, { actor: me.name, role: me.role, action: "Deleted saved view", entity: `${view.entity} · ${view.name}` });
  revalidatePath("/", "layout");
  return { ok: true };
}
