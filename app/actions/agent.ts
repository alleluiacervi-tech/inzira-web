"use server";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { WORKS_CASES, assignableStaff, canSeeCase } from "@/lib/access";
import { getStaffUser, normalisePhone } from "@/lib/auth";
import { rwf } from "@/lib/format";
import { audit, db, event, fail, invoiceFor, nextNumber, notify, refFor, s, type Result } from "@/lib/mutate";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { asLocale, type Locale } from "@/lib/i18n/locale";
import { english, feeVars, msg, sms, smsText } from "@/lib/i18n/stored";
import { STAGE_LABEL } from "@/lib/status";
import { SITE } from "@/lib/site";
import { enqueue, sendSoon } from "@/lib/outbox";
import { getService } from "@/lib/repo";
import { ALLOWED, MAX_BYTES, checkUpload, deleteFile, humanSize, putFile, sniffType } from "@/lib/storage";
import { STAGES, type Closed, type Hold, type Stage } from "@/lib/types";

/** Loads a case for the signed-in staff member, if they may see it and hold `perm`. */
async function work(ref: string, perm?: Permission) {
  const me = await getStaffUser();
  if (!me) return { error: "Your session has ended. Sign in again." } as const;
  const d = await db();
  const [r] = await d.select().from(s.requests).where(eq(s.requests.ref, ref));
  if (!r || !canSeeCase(me, r)) return { error: "Case not found." } as const;
  if (perm && !me.permissions.has(perm)) return { error: `Your role can’t do this (${PERMISSIONS[perm]}). Ask a supervisor.` } as const;
  const svc = await getService(r.serviceSlug);
  return { me, d, r, flow: (svc?.flow ?? [...STAGES]) as Stage[] };
}
const done = (ref: string): Result => { revalidatePath("/console", "layout"); revalidatePath(`/portal/requests/${ref}`); return { ok: true }; };
const now = () => new Date().toISOString();

export async function reviewDocument(ref: string, docId: string, decision: "approve" | "reject", reason = ""): Promise<Result> {
  const w = await work(ref, "reviewDocs");
  if ("error" in w) return fail(w.error!);
  const { me, d, r } = w;
  const [doc] = await d.select().from(s.requestDocuments).where(eq(s.requestDocuments.id, docId));
  if (!doc || doc.ref !== ref) return fail("Document not found.");
  if (decision === "reject" && !reason.trim()) return fail("Write the reason the customer will see.");
  await d.transaction(async (tx) => {
    if (decision === "approve") {
      await tx.update(s.requestDocuments).set({ status: "approved", reviewedAt: now(), reviewedBy: me.id, note: null }).where(eq(s.requestDocuments.id, docId));
      await event(tx, ref, msg("ev.docApproved", { doc: doc.name }), me.id);
      const all = await tx.select().from(s.requestDocuments).where(eq(s.requestDocuments.ref, ref));
      const blocked = all.some((x) => x.status === "rejected" || (x.required && x.status === "required"));
      if (r.hold?.reason === "document" && !blocked) {
        await tx.update(s.requests).set({ hold: null }).where(eq(s.requests.ref, ref));
        await notify(tx, ref, { icon: "check", title: msg("nt.docsApproved", { ref }), sms: sms("docsApproved") });
      }
    } else {
      const holdMsg = msg("hold.newCopy", { doc: doc.name });
      const hold: Hold = { reason: "document", title: english(holdMsg, "title"), detail: reason.trim(), since: now(), msg: holdMsg };
      await tx.update(s.requestDocuments).set({ status: "rejected", reviewedAt: now(), reviewedBy: me.id, note: reason.trim() }).where(eq(s.requestDocuments.id, docId));
      await tx.update(s.requests).set({ hold }).where(eq(s.requests.ref, ref));
      await tx.insert(s.messages).values({ ref, by: me.id, body: reason.trim() });
      await event(tx, ref, msg("ev.docRejected", { doc: doc.name, reason: reason.trim() }), me.id);
      await notify(tx, ref, { icon: "alert", title: msg("nt.newCopy", { agent: me.name.split(" ")[0], doc: doc.name, ref }), sms: sms("newCopy", { doc: doc.name, reason: reason.trim() }) });
    }
    await audit(tx, { actor: me.name, role: me.role, action: decision === "approve" ? "Approved document" : "Rejected document", entity: `${ref} · ${doc.name}` });
  });
  return done(ref);
}

/** A message to the customer. With `wait`, the case goes on hold until they answer. */
export async function messageCustomer(ref: string, body: string, wait: boolean): Promise<Result> {
  const w = await work(ref, "viewAssigned");
  if ("error" in w) return fail(w.error!);
  const { me, d } = w;
  if (!body.trim()) return fail("Write a message first.");
  await d.transaction(async (tx) => {
    await tx.insert(s.messages).values({ ref, by: me.id, body: body.trim() });
    if (wait) {
      const holdMsg = msg("hold.question");
      await tx.update(s.requests).set({ hold: { reason: "information", title: english(holdMsg, "title"), detail: body.trim(), since: now(), msg: holdMsg } }).where(eq(s.requests.ref, ref));
      await event(tx, ref, msg("ev.infoRequested"), me.id, body.trim());
    }
    const agent = me.name.split(" ")[0];
    await notify(tx, ref, { icon: "msg", title: msg("nt.agentMessage", { agent, excerpt: body.trim().slice(0, 90) }), sms: wait ? sms("question", { agent, question: body.trim().slice(0, 300) }) : undefined });
  });
  return done(ref);
}

export async function clearHold(ref: string): Promise<Result> {
  const w = await work(ref, "updateStatus");
  if ("error" in w) return fail(w.error!);
  await w.d.transaction(async (tx) => {
    await tx.update(s.requests).set({ hold: null }).where(eq(s.requests.ref, ref));
    await event(tx, ref, msg("ev.holdCleared"), w.me.id);
  });
  return done(ref);
}

export async function setStage(ref: string, stage: Stage, message: string, tell: boolean): Promise<Result> {
  const w = await work(ref, stage === "completed" ? "complete" : "updateStatus");
  if ("error" in w) return fail(w.error!);
  const { me, d, r, flow } = w;
  if (!flow.includes(stage)) return fail("That stage does not apply to this service.");
  if (r.closed) return fail("This case is closed.");
  await d.transaction(async (tx) => {
    await tx.update(s.requests).set({ stage, stageDates: { ...r.stageDates, [stage]: r.stageDates[stage] ?? now() }, hold: stage === "completed" ? null : r.hold }).where(eq(s.requests.ref, ref));
    const done = stage === "completed";
    await event(tx, ref, done ? msg("ev.completed") : msg("ev.moved", { stage: STAGE_LABEL[stage] }), me.id, message.trim() || undefined);
    // The agent's own message, when they wrote one, is the SMS as typed.
    if (tell) await notify(tx, ref, {
      icon: done ? "check" : "send",
      title: done ? msg("nt.completed", { ref }) : msg("nt.moved", { ref, stage: STAGE_LABEL[stage] }),
      sms: message.trim() ? sms("ownWords", { text: message.trim() }) : done ? sms("completed") : sms("moved", { stage: STAGE_LABEL[stage] }),
    });
    await audit(tx, { actor: me.name, role: me.role, action: "Changed stage", entity: `${ref} · ${STAGE_LABEL[r.stage]} → ${STAGE_LABEL[stage]}` });
  });
  return done(ref);
}

export async function markSubmitted(ref: string, channel: string, officialRef: string): Promise<Result> {
  const w = await work(ref, "updateStatus");
  if ("error" in w) return fail(w.error!);
  const { me, d, r, flow } = w;
  if (!flow.includes("institution")) return fail("This service is not submitted to an institution.");
  if (!officialRef.trim()) return fail("Add the official reference first.");
  const again = r.stage === "institution";
  await d.transaction(async (tx) => {
    await tx.update(s.requests).set({ stage: "institution", channel: channel || r.channel, officialRef: officialRef.trim(), hold: null, stageDates: { ...r.stageDates, institution: r.stageDates.institution ?? now() } }).where(eq(s.requests.ref, ref));
    const vars = { channel: channel || r.channel, officialRef: officialRef.trim() };
    await event(tx, ref, again ? msg("ev.resubmitted", vars) : msg("ev.submitted", vars), me.id);
    await notify(tx, ref, { icon: "send", title: again ? msg("nt.resubmitted", vars) : msg("nt.submitted", vars), sms: sms("submitted", vars) });
    await audit(tx, { actor: me.name, role: me.role, action: "Added official reference", entity: `${ref} · ${officialRef.trim()}` });
  });
  return done(ref);
}

export async function scheduleFollowUp(ref: string, what: string): Promise<Result> {
  const w = await work(ref, "viewAssigned");
  if ("error" in w) return fail(w.error!);
  // Tomorrow at 10:00 Kigali time (UTC+2).
  const t = new Date(Date.now() + 864e5); t.setUTCHours(8, 0, 0, 0);
  await w.d.transaction(async (tx) => {
    await tx.update(s.requests).set({ followUp: { at: t.toISOString(), what: what.trim() || "Follow up" } }).where(eq(s.requests.ref, ref));
    await event(tx, ref, msg("ev.followUp"), w.me.id);
  });
  return done(ref);
}

export async function addNote(ref: string, body: string): Promise<Result> {
  const w = await work(ref, "viewAssigned");
  if ("error" in w) return fail(w.error!);
  if (!body.trim()) return fail("Write the note first.");
  await w.d.insert(s.notes).values({ ref, by: w.me.id, body: body.trim() });
  return done(ref);
}

export async function assignCase(ref: string, agentId: string | null): Promise<Result> {
  const w = await work(ref, "assign");
  if ("error" in w) return fail(w.error!);
  const agent = agentId ? await assignableStaff(w.d, agentId) : null;
  if (agentId && !agent) return fail("That person can’t take cases.");
  await w.d.transaction(async (tx) => {
    await tx.update(s.requests).set({ agentId }).where(eq(s.requests.ref, ref));
    await event(tx, ref, agent ? msg("ev.assigned", { name: agent.name }) : msg("ev.unassigned"), w.me.id);
    await audit(tx, { actor: w.me.name, role: w.me.role, action: "Assigned case", entity: `${ref} → ${agent?.name ?? "nobody"}` });
  });
  return done(ref);
}

/** Saves the two fee lines. Changing OUR fee needs the "change our fee" permission (supervisors). */
export async function saveFees(ref: string, official: number | null, ours: number): Promise<Result> {
  const w = await work(ref, "recordOfficial");
  if ("error" in w) return fail(w.error!);
  const { me, d, r } = w;
  if (ours !== r.ours && !me.permissions.has("changeOurs")) return fail("Changing our fee needs a supervisor. Ask one to change it on this case.");
  if (ours < 0 || (official !== null && official < 0)) return fail("Amounts can’t be negative.");
  await d.transaction(async (tx) => {
    await tx.update(s.requests).set({ official: r.officialMode ? null : official, ours }).where(eq(s.requests.ref, ref));
    if (!r.officialMode && official !== r.official) await audit(tx, { actor: me.name, role: me.role, action: "Recorded official fee", entity: `${ref} · ${official === null ? "cleared" : rwf(official)}`, fee: true });
    if (ours !== r.ours) {
      await event(tx, ref, msg("ev.feeChanged", { from: rwf(r.ours), to: rwf(ours) }), me.id);
      await audit(tx, { actor: me.name, role: me.role, action: "Changed assistance fee on a case", entity: `${ref} · ${rwf(r.ours)} → ${rwf(ours)}`, fee: true });
    }
  });
  return done(ref);
}

/** Sends the confirmed amounts to the customer, who can then approve and pay. */
export async function sendQuote(ref: string): Promise<Result> {
  const w = await work(ref, "recordOfficial");
  if ("error" in w) return fail(w.error!);
  const { me, d, r } = w;
  if (!r.officialMode && r.official === null) return fail("Record the official fee for this case first.");
  if (r.ours <= 0) return fail("Set our fee for this case first.");
  const fees = { ...feeVars(r.officialMode, r.official), ours: rwf(r.ours) };
  await d.transaction(async (tx) => {
    // Fees are due three days after they are sent, unless a date was already agreed.
    await tx.update(s.requests).set({ quote: "confirmed", dueAt: r.dueAt ?? new Date(Date.now() + 3 * 864e5).toISOString() }).where(eq(s.requests.ref, ref));
    await event(tx, ref, msg("ev.feesConfirmed", fees), me.id);
    await notify(tx, ref, { icon: "card", title: msg("nt.fees", { ref, ...fees }), sms: sms("fees", fees) });
    await audit(tx, { actor: me.name, role: me.role, action: "Sent quote", entity: `${ref} · ${english(msg("ev.feesConfirmed", fees), "body")}`, fee: true });
  });
  return done(ref);
}

export async function closeCase(ref: string, kind: Closed["kind"], reason: string): Promise<Result> {
  const w = await work(ref, "complete");
  if ("error" in w) return fail(w.error!);
  if (!reason.trim()) return fail("Write the reason the customer will see.");
  const closed: Closed = { kind, at: now(), reason: reason.trim() };
  const cancelled = kind === "cancelled";
  // The reason is the agent's own words; the summary around it is ours.
  const summary = msg(cancelled ? "sum.cancelled" : "sum.rejected");
  await w.d.transaction(async (tx) => {
    await tx.update(s.requests).set({ closed, hold: null, summary: { title: english(summary, "title"), body: reason.trim(), msg: summary }, next: english(summary, "next") }).where(eq(s.requests.ref, ref));
    await event(tx, ref, msg(cancelled ? "ev.cancelled" : "ev.rejected"), w.me.id, reason.trim());
    await notify(tx, ref, { icon: "alert", title: msg(cancelled ? "nt.cancelled" : "nt.rejected", { ref }), sms: sms(cancelled ? "cancelled" : "rejected", { reason: reason.trim() }) });
    await audit(tx, { actor: w.me.name, role: w.me.role, action: kind === "cancelled" ? "Cancelled case" : "Recorded rejection", entity: ref });
  });
  return done(ref);
}

/** Opens a case for a walk-in, a caller or a WhatsApp message. `locale` is the language of a new
 *  customer's portal and SMS; an existing customer keeps theirs. */
export async function createIntake(input: { slug: string; name: string; phone: string; kind: "person" | "business" | "organization"; source: string; notes: string; locale?: Locale }): Promise<Result<{ ref: string }>> {
  const me = await getStaffUser();
  if (!me) return fail("Your session has ended. Sign in again.");
  if (!me.permissions.has(WORKS_CASES)) return fail(`Your role can’t do this (${PERMISSIONS[WORKS_CASES]}).`);
  const phone = normalisePhone(input.phone);
  if (!input.name.trim()) return fail("Enter the customer’s name.");
  if (!phone) return fail("Enter a Rwandan mobile number, e.g. 788 123 456.");
  const service = await getService(input.slug || "other-online-service");
  if (!service) return fail("Service not found.");
  const d = await db();
  const { ref, message } = await d.transaction(async (tx) => {
    let [account] = await tx.select().from(s.accounts).where(eq(s.accounts.phone, phone));
    if (!account) [account] = await tx.insert(s.accounts).values({ id: `acc-${randomBytes(6).toString("hex")}`, name: input.name.trim(), first: input.name.trim().split(" ")[0], phone, languages: [], locale: asLocale(input.locale) }).returning();
    const [profile] = await tx.insert(s.profiles).values({ id: `p-${randomBytes(6).toString("hex")}`, accountId: account.id, kind: input.kind, name: input.name.trim(), relation: input.kind === "person" ? "self" : null }).returning();
    const ref = refFor(await nextNumber(tx, "request"));
    const at = now();
    const summary = msg("sum.receivedIntake", { agent: me.name.split(" ")[0] });
    await tx.insert(s.requests).values({
      ref, serviceSlug: service.slug, profileId: profile.id, agentId: me.id, stage: "received", stageDates: { received: at }, channel: service.channel,
      summary: { title: english(summary, "title"), body: english(summary, "body"), msg: summary },
      next: english(summary, "next"), invoice: invoiceFor(await nextNumber(tx, "invoice")),
      official: service.official.mode ? null : service.official.amount, officialMode: service.official.mode ?? null,
      officialLabel: service.official.mode === "none" ? "Official fee" : `${service.official.label ?? "Official fee"} · ${service.channel}`,
      ours: service.ours, oursStandard: service.ours, oursUnit: service.oursUnit ?? null, quote: "estimate", officialReceipt: service.official.mode ? "na" : "awaiting",
    });
    if (service.documents.length) await tx.insert(s.requestDocuments).values(service.documents.map((doc, i) => ({ id: `${ref}-d${i + 1}`, ref, position: i, name: doc.name, group: doc.group, required: doc.required, status: "required" as const })));
    await event(tx, ref, msg("ev.opened"), me.id, input.source);
    if (input.notes.trim()) await tx.insert(s.notes).values({ ref, by: me.id, body: input.notes.trim() });
    await audit(tx, { actor: me.name, role: me.role, action: "Opened case from intake", entity: `${ref} · ${service.name} · ${input.source}` });
    const message = await enqueue(tx, { channel: "sms", to: phone, ref, message: smsText(account.locale, sms("opened", { ref, service: service.name, serviceSlug: service.slug, url: SITE.url })) });
    return { ref, message };
  });
  sendSoon([message]);
  revalidatePath("/console", "layout");
  return { ok: true, ref };
}

/** Files an agent adds to a case:
 *  - "deliverable": the final document from the institution, delivered to the customer's portal;
 *  - "receipt": the institution's official receipt for the fee we passed on;
 *  - "document": a customer document received in person or on WhatsApp, filed against the checklist. */
export async function uploadCaseFile(fd: FormData): Promise<Result> {
  const ref = String(fd.get("ref") ?? "");
  const kind = String(fd.get("kind") ?? "") as "deliverable" | "receipt" | "document";
  const file = fd.get("file");
  const perm = kind === "deliverable" ? "complete" : kind === "receipt" ? "recordOfficial" : "reviewDocs";
  const w = await work(ref, perm);
  if ("error" in w) return fail(w.error!);
  const { me, d, r } = w;
  if (!(file instanceof File) || !file.size) return fail("Choose a file first.");
  if (file.size > MAX_BYTES) return fail("That file is larger than 10 MB.");
  if (!ALLOWED.test(file.type) || !(await checkUpload(file))) return fail("Please upload a PDF, JPG or PNG.");
  const name = String(fd.get("name") ?? "").trim() || file.name;
  const docId = String(fd.get("docId") ?? "");
  const fileId = `f-${randomBytes(6).toString("hex")}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffType(bytes);
  if (!mime) return fail("Please upload a PDF, JPG or PNG.");
  await putFile(`${ref}/${fileId}`, bytes, mime);
  try { await d.transaction(async (tx) => {
    await tx.insert(s.files).values({ id: fileId, ref, storageKey: `${ref}/${fileId}`, name: file.name, mime, bytes: file.size, uploadedBy: me.id });
    if (kind === "deliverable") {
      await tx.insert(s.deliverables).values({ id: `${ref}-o${randomBytes(3).toString("hex")}`, ref, name, issuedAt: now(), issuedBy: r.channel, fileId });
      await event(tx, ref, msg("ev.delivered", { doc: name }), me.id);
      await notify(tx, ref, { icon: "check", title: msg("nt.delivered", { doc: name }), sms: sms("delivered", { doc: name }) });
      await audit(tx, { actor: me.name, role: me.role, action: "Delivered document", entity: `${ref} · ${name}` });
    } else if (kind === "receipt") {
      await tx.update(s.requests).set({ officialReceipt: "attached" }).where(eq(s.requests.ref, ref));
      await event(tx, ref, msg("ev.receiptAttached"), me.id);
      await audit(tx, { actor: me.name, role: me.role, action: "Attached official receipt", entity: `${ref} · ${file.name}`, fee: true });
    } else {
      const [doc] = docId ? await tx.select().from(s.requestDocuments).where(eq(s.requestDocuments.id, docId)) : [];
      if (doc && doc.ref !== ref) throw new Error("wrong case");
      const fields = { status: "received" as const, fileId, fileName: file.name, fileSize: humanSize(file.size), uploadedAt: now(), note: null, reviewedAt: null, reviewedBy: null };
      if (doc) await tx.update(s.requestDocuments).set(fields).where(eq(s.requestDocuments.id, doc.id));
      else await tx.insert(s.requestDocuments).values({ id: `${ref}-x${randomBytes(3).toString("hex")}`, ref, position: 99, name, group: "Other", required: false, ...fields });
      await event(tx, ref, msg("ev.docAddedByAgent", { doc: doc?.name ?? name }), me.id);
      await audit(tx, { actor: me.name, role: me.role, action: "Added document", entity: `${ref} · ${doc?.name ?? name}` });
    }
  }); } catch (e) { await deleteFile(`${ref}/${fileId}`).catch(() => {}); throw e; }
  return done(ref);
}
