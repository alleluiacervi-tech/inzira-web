"use server";
import { randomBytes } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { consumeEmailCode, endOtherSessions, endSession, getSession, issueEmailCode, normaliseEmail, normalisePhone, requireCustomerId, startSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { deleteAccount, finishedWithDocuments, purgeDocuments } from "@/lib/privacy";
import { iso } from "@/lib/db";
import { asLocale, getLocale, rememberLocale, type Locale } from "@/lib/i18n/locale";
import { text as tr } from "@/lib/i18n/messages";
import type en from "@/lib/i18n/en.json";
import type { LibraryDoc } from "@/lib/types";
import { english, msg, sms } from "@/lib/i18n/stored";
import { maskNationalId, parseDob, prettyPhone, rwf } from "@/lib/format";
import { idAsk, idPolicyOf, mentionsNationalId, nationalIdDigits, nationalIdError } from "@/lib/identity";
import { open, seal } from "@/lib/crypto";
import { audit, db, event, fail, invoiceFor, nextNumber, notify, refFor, s, type Result } from "@/lib/mutate";
import { reconcilePayment } from "@/lib/billing";
import { isUniqueViolation } from "@/lib/db/errors";
import { isReservedTestEmail } from "@/lib/email";
import { refusalKind, type RefusalKind } from "@/lib/intouchpay";
import { PromptRefused, methodFor, newPrompt } from "@/lib/payments";
import { SITE } from "@/lib/site";
import { amountDue } from "@/lib/status";
import { getService, listMyDocuments } from "@/lib/repo";
import { TOO_MANY, allowIp } from "@/lib/ratelimit";
import { ALLOWED, MAX_BYTES, checkUpload, deleteFile, humanSize, putFile, sniffType } from "@/lib/storage";

/** A file whose content is not what it claimed to be. */
class BadFile extends Error {}
const id = (prefix: string) => `${prefix}-${randomBytes(6).toString("hex")}`;
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Errors are written in the customer's language: their account's once signed in, else the browser's. */
async function customerLocale(): Promise<Locale> {
  const session = await getSession();
  if (session?.kind !== "customer") return getLocale();
  const [a] = await (await db()).select({ locale: s.accounts.locale }).from(s.accounts).where(eq(s.accounts.id, session.subjectId));
  return a?.locale ?? getLocale();
}
type Refusal = keyof typeof en.custErr;
const REFUSAL_ERROR = { notRegistered: "payNotRegistered", network: "payNetwork", badNumber: "payBadNumber", amount: "payAmount", other: "momoDown" } as const satisfies Record<RefusalKind, Refusal>;
const refuse = async (key: Refusal, vars?: Record<string, string | number>) => fail(tr(await customerLocale(), `custErr.${key}`, vars));

async function checkFile(f: File): Promise<string | null> {
  if (f.size > MAX_BYTES) return tr(await customerLocale(), "custErr.fileBig", { name: f.name });
  if (!ALLOWED.test(f.type) || !(await checkUpload(f))) return tr(await customerLocale(), "custErr.fileType", { name: f.name });
  return null;
}

/** Sends a new request: checks the code emailed to the customer, creates their contact record if needed, stores the
 *  files and opens the request. With "portal" (the default) it also signs them in; without it they stay a contact:
 *  they can follow the request with its reference and email, and open a portal later by signing in with that email. */
export async function submitRequest(fd: FormData): Promise<Result<{ ref: string; portal: boolean }>> {
  const email = normaliseEmail(text(fd, "email"));
  const phoneInput = text(fd, "phone");
  const phone = phoneInput ? normalisePhone(phoneInput) : null;
  const name = text(fd, "name"), subject = text(fd, "subject"), forWho = text(fd, "forWho") || "me";
  const digits = nationalIdDigits(text(fd, "nid"));
  const portal = fd.get("portal") !== "0";
  if (!email) return refuse("badEmail");
  if (phoneInput && !phone) return refuse("badPhone");
  if (!name) return refuse("name");
  const slug = text(fd, "slug") || "other-online-service";
  const service = await getService(slug);
  if (!service || (!service.visible && slug !== "other-online-service")) return refuse("service");
  // The ID rule is the service's. A business request never asks for a personal number. An uncertain rule stays optional.
  const ask = idAsk(service, forWho);
  const policy = idPolicyOf(service);
  const idErr = nationalIdError(digits);
  const consent = text(fd, "idConsent") === "1";
  const dobRaw = text(fd, "dob");
  const dob = dobRaw ? parseDob(dobRaw) : null;
  if (dobRaw && !dob) return refuse("badDob");
  const storeId = ask === "required" || (ask === "optional" && digits.length > 0);
  if (storeId) {
    if (idErr === "long") return refuse("idLong");
    if (idErr) return refuse("idShort");
    if (!consent) return refuse("idConsent");
    if (!dob) return refuse("badDob");
  }
  const files = service.documents.map((_, i) => fd.get(`file-${i}`)).map((f) => (f instanceof File && f.size ? f : null));
  const extra = fd.getAll("file-extra").filter((f): f is File => f instanceof File && f.size > 0);
  for (const f of [...files, ...extra]) { const bad = f && (await checkFile(f)); if (bad) return fail(bad); }

  if (!(await allowIp("request"))) return refuse("tooMany");
  const checked = await consumeEmailCode(email, text(fd, "code"));
  if (!checked.ok) return checked;

  const d = await db();
  const now = new Date().toISOString();
  // A phone number belongs to one account. Someone else's account is never joined to this email just because the number matches.
  if (phone) {
    const [owner] = await d.select({ id: s.accounts.id, email: s.accounts.email }).from(s.accounts).where(eq(s.accounts.phone, phone));
    if (owner && owner.email?.toLowerCase() !== email) return refuse("phoneTaken");
  }
  // Files are written inside the transaction; if it fails, the ones already stored are removed so none is left behind.
  const stored: string[] = [];
  const result = await d.transaction(async (tx) => {
    let [account] = await tx.select().from(s.accounts).where(sql`lower(${s.accounts.email}) = ${email}`);
    if (!account) {
      // A new customer's portal and messages are in the language they used to send the request.
      [account] = await tx.insert(s.accounts).values({
        id: id("acc"), name, first: name.split(" ")[0], phone, email, languages: [], locale: await getLocale(), registeredAt: portal ? now : null,
      }).returning();
    } else {
      const set: Partial<typeof s.accounts.$inferInsert> = {};
      if (portal && !account.registeredAt) set.registeredAt = now;
      if (phone && !account.phone) set.phone = phone;
      if (Object.keys(set).length) [account] = await tx.update(s.accounts).set(set).where(eq(s.accounts.id, account.id)).returning();
    }
    const profiles = await tx.select().from(s.profiles).where(eq(s.profiles.accountId, account.id));
    let profile =
      forWho === "me" ? profiles.find((p) => p.relation === "self")
      : forWho === "business" ? profiles.find((p) => p.kind === "business" && p.name.toLowerCase() === subject.toLowerCase())
      : profiles.find((p) => p.relation === "family" && p.name.toLowerCase() === subject.toLowerCase());
    if (!profile) {
      [profile] = await tx.insert(s.profiles).values({
        id: id("p"), accountId: account.id, kind: forWho === "business" ? "business" : "person", name: forWho === "me" ? name : subject || name,
        relation: forWho === "business" ? null : forWho === "me" ? "self" : "family",
        idMasked: storeId ? maskNationalId(digits) : null, nationalId: storeId ? seal(digits) : null,
        dateOfBirth: forWho === "business" ? null : dob,
      }).returning();
    } else if (storeId || (dob && !profile.dateOfBirth)) {
      const current = storeId ? open(profile.nationalId) : null;
      const replaceId = storeId && current !== digits;
      if (replaceId || (dob && profile.dateOfBirth !== dob)) {
        await tx.update(s.profiles).set({
          ...(replaceId ? { nationalId: seal(digits), idMasked: maskNationalId(digits), idCheckedAt: null, idCheckedBy: null } : {}),
          ...(dob && profile.dateOfBirth !== dob ? { dateOfBirth: dob } : {}),
        }).where(eq(s.profiles.id, profile.id));
        // The audit line names the profile, never the digits.
        if (replaceId && current) await audit(tx, { actor: account.name, role: "Customer", action: "Updated national ID on profile", entity: profile.name });
      }
    }

    const ref = refFor(await nextNumber(tx, "request"));
    const invoice = invoiceFor(await nextNumber(tx, "invoice"));
    const summary = msg("sum.received", { contact: email });
    await tx.insert(s.requests).values({
      ref, serviceSlug: service.slug, profileId: profile.id, agentId: null, stage: "received", stageDates: { received: now }, channel: service.channel,
      summary: { title: english(summary, "title"), body: english(summary, "body"), msg: summary },
      next: english(summary, "next"), purpose: text(fd, "purpose") || null,
      idPolicy: policy, idRequired: ask === "required", idReview: ask === "required" ? "pending" : null, idConsent: storeId && consent,
      requirementsSnapshot: service.requirements,
      invoice, official: service.official.mode ? null : service.official.amount, officialMode: service.official.mode ?? null,
      officialLabel: service.official.mode === "none" ? "Official fee" : `${service.official.label ?? "Official fee"} · ${service.channel}`,
      ours: service.ours, oursStandard: service.ours, oursUnit: service.oursUnit ?? null, quote: "estimate",
      officialReceipt: service.official.mode ? "na" : "awaiting",
    });

    const docs = service.documents.map((doc, i) => ({ id: `${ref}-d${i + 1}`, ref, position: i, name: doc.name, group: doc.group, required: doc.required, status: "required" as const }));
    const uploads: { docId: string | null; file: File }[] = [...files.map((f, i) => (f ? { docId: docs[i].id, file: f } : null)).filter((x) => !!x), ...extra.map((f) => ({ docId: null, file: f }))];
    for (const u of uploads) {
      const fileId = id("f");
      const bytes = new Uint8Array(await u.file.arrayBuffer());
      const mime = sniffType(bytes);
      if (!mime) throw new BadFile(u.file.name);
      stored.push(`${ref}/${fileId}`);
      await putFile(`${ref}/${fileId}`, bytes, mime);
      await tx.insert(s.files).values({ id: fileId, ref, storageKey: `${ref}/${fileId}`, name: u.file.name, mime, bytes: u.file.size, uploadedBy: "customer" });
      const doc = docs.find((x) => x.id === u.docId);
      if (doc) Object.assign(doc, { status: "received", fileId, fileName: u.file.name, fileSize: humanSize(u.file.size), uploadedAt: now });
      else docs.push({ id: `${ref}-x${docs.length + 1}`, ref, position: docs.length, name: u.file.name, group: "Other", required: false, status: "received", ...{ fileId, fileName: u.file.name, fileSize: humanSize(u.file.size), uploadedAt: now } } as never);
    }
    if (docs.length) await tx.insert(s.requestDocuments).values(docs);

    const notes = text(fd, "notes");
    if (notes) await tx.insert(s.messages).values({ ref, by: "customer", body: notes });
    await event(tx, ref, msg("ev.opened"), "customer", text(fd, "purpose") || undefined);
    const received = msg("nt.received", { service: service.name, serviceSlug: service.slug, ref });
    await tx.insert(s.notifications).values({ accountId: account.id, icon: "check", title: english(received), key: received.key, vars: received.vars, href: `/portal/requests/${ref}` });
    await audit(tx, { actor: account.name, role: "Customer", action: "Opened request", entity: `${ref} · ${service.name}` });
    return { ref, accountId: account.id, locale: asLocale(account.locale) };
  }).catch(async (e) => {
    await Promise.all(stored.map((key) => deleteFile(key).catch(() => {})));
    if (e instanceof BadFile) return null;
    throw e;
  });
  if (!result) return refuse("fileType", { name: "your file" });

  if (portal) {
    await startSession("customer", result.accountId);
    // A returning customer's account may be in the other language; the whole site follows it, as on sign-in.
    await rememberLocale(result.locale);
  }
  revalidatePath("/", "layout");
  return { ok: true, ref: result.ref, portal };
}

/** Confirms the request belongs to the signed-in customer. */
async function ownRequest(ref: string) {
  const accountId = await requireCustomerId();
  const d = await db();
  const [row] = await d.select({ ref: s.requests.ref, accountId: s.profiles.accountId, name: s.accounts.name, email: s.accounts.email })
    .from(s.requests).innerJoin(s.profiles, eq(s.profiles.id, s.requests.profileId)).innerJoin(s.accounts, eq(s.accounts.id, s.profiles.accountId))
    .where(eq(s.requests.ref, ref));
  return row && row.accountId === accountId ? { d, name: row.name, email: row.email } : null;
}

export async function sendMessage(ref: string, body: string): Promise<Result> {
  const own = await ownRequest(ref);
  if (!own) return refuse("request");
  if (!body.trim()) return refuse("message");
  await own.d.insert(s.messages).values({ ref, by: "customer", body: body.trim().slice(0, 4000) });
  revalidatePath(`/portal/requests/${ref}`);
  return { ok: true };
}

/** Replaces the National ID on a request an agent sent back. The reference stays. The client cannot set the review outcome. */
export async function correctSubmittedId(fd: FormData): Promise<Result> {
  const ref = text(fd, "ref");
  const own = await ownRequest(ref);
  if (!own) return refuse("request");
  if (!(await allowIp("request"))) return refuse("tooMany");
  const [req] = await own.d.select().from(s.requests).where(eq(s.requests.ref, ref));
  if (!req || req.closed) return refuse("finished");
  if (!req.idRequired || req.idReview !== "correction") return refuse("idClosed");
  const digits = nationalIdDigits(text(fd, "nid"));
  const idErr = nationalIdError(digits);
  if (idErr === "long") return refuse("idLong");
  if (idErr) return refuse("idShort");
  if (text(fd, "idConsent") !== "1") return refuse("idConsent");
  const dobRaw = text(fd, "dob");
  const dob = dobRaw ? parseDob(dobRaw) : null;
  if (!dob) return refuse("badDob");
  const note = text(fd, "note");
  if (note && mentionsNationalId(note)) return refuse("idShort");
  const [profile] = await own.d.select().from(s.profiles).where(eq(s.profiles.id, req.profileId));
  if (!profile) return refuse("request");
  await own.d.transaction(async (tx) => {
    await tx.update(s.profiles).set({
      nationalId: seal(digits), idMasked: maskNationalId(digits), idCheckedAt: null, idCheckedBy: null, dateOfBirth: dob,
    }).where(eq(s.profiles.id, profile.id));
    await tx.update(s.requests).set({
      idReview: "pending", idReviewNote: null, idReviewAt: null, idReviewBy: null, idConsent: true,
      hold: req.hold?.msg?.key === "hold.idCorrection" ? null : req.hold,
    }).where(eq(s.requests.ref, ref));
    await event(tx, ref, msg("ev.idUpdated"), "customer");
    await notify(tx, ref, { icon: "check", title: msg("nt.idUpdated", { ref }), sms: sms("idUpdated", { ref }) });
    await audit(tx, { actor: own.name, role: "Customer", action: "Corrected national ID", entity: ref });
  });
  revalidatePath(`/portal/requests/${ref}`);
  revalidatePath("/console", "layout");
  return { ok: true };
}

/** Uploads or replaces one document on a request. */
export async function uploadDocument(fd: FormData): Promise<Result<{ docs: LibraryDoc[] }>> {
  const docId = text(fd, "docId");
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return refuse("chooseFile");
  const bad = await checkFile(file);
  if (bad) return fail(bad);
  const d = await db();
  const [doc] = await d.select().from(s.requestDocuments).where(eq(s.requestDocuments.id, docId));
  if (!doc) return refuse("document");
  const own = await ownRequest(doc.ref);
  if (!own) return refuse("document");
  const fileId = id("f");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffType(bytes);
  if (!mime) return fail(await checkFile(file) ?? tr(await customerLocale(), "custErr.fileType", { name: file.name }));
  await putFile(`${doc.ref}/${fileId}`, bytes, mime);
  try { await d.transaction(async (tx) => {
    await tx.insert(s.files).values({ id: fileId, ref: doc.ref, storageKey: `${doc.ref}/${fileId}`, name: file.name, mime, bytes: file.size, uploadedBy: "customer" });
    await tx.update(s.requestDocuments).set({ status: "received", fileId, fileName: file.name, fileSize: humanSize(file.size), uploadedAt: new Date().toISOString(), note: null, reviewedAt: null, reviewedBy: null })
      .where(eq(s.requestDocuments.id, docId));
    await event(tx, doc.ref, msg("ev.docUploaded", { doc: doc.name }), "customer");
    await audit(tx, { actor: own.name, role: "Customer", action: "Uploaded document", entity: `${doc.ref} · ${doc.name}` });
  }); } catch (e) { await deleteFile(`${doc.ref}/${fileId}`).catch(() => {}); throw e; }
  revalidatePath("/portal", "layout");
  return { ok: true, docs: await listMyDocuments() };
}

/** Approves the quote and sends a mobile money prompt for what is still due. */
export async function startPayment(ref: string, phoneInput: string): Promise<Result<{ txId: number; receipt: string }>> {
  const own = await ownRequest(ref);
  if (!own) return refuse("request");
  const phone = normalisePhone(phoneInput);
  if (!phone) return refuse("payPhone");
  const d = own.d;
  const [r] = await d.select().from(s.requests).where(eq(s.requests.ref, ref));
  if (r.quote === "estimate") return refuse("notConfirmed");
  if (!(await allowIp("payment"))) return refuse("tooMany");
  let txs = await d.select().from(s.transactions).where(eq(s.transactions.ref, ref));
  // A prompt left open (a closed tab, a missed callback) would block the customer until the daily job. Ask the provider
  // first: it may have been paid, or it may be old enough to close, and only a prompt still within its time stays.
  if (txs.some((t) => t.status === "pending")) {
    for (const t of txs) if (t.status === "pending") await reconcilePayment(t.id);
    txs = await d.select().from(s.transactions).where(eq(s.transactions.ref, ref));
  }
  const billing = { ...r, official: r.official, officialMode: r.officialMode ?? undefined, transactions: txs.map((t) => ({ ...t, at: iso(t.at)! })) } as never;
  const due = amountDue(billing);
  if (due <= 0) return refuse("nothingDue");
  const paidOfficial = txs.filter((t) => t.status === "paid").reduce((n, t) => n + t.official, 0);
  const official = Math.max(0, (r.official ?? 0) - paidOfficial);
  if (txs.some((t) => t.status === "pending")) return refuse("promptWaiting");
  const receipt = txs.length ? `${r.invoice}-${txs.length + 1}` : r.invoice;
  let prompt: ReturnType<typeof newPrompt>;
  try { prompt = newPrompt(phone, isReservedTestEmail(own.email ?? "")); } catch (e) { console.error("[payments]", e); return refuse("momoDown"); }
  // Record the attempt first, with the provider's reference already known, so a callback that arrives quickly finds it
  // and a call that times out after the provider accepted it can still be settled. The database allows one waiting prompt
  // per request, so two taps at once cannot send two.
  let tx: { id: number };
  try {
    [tx] = await d.insert(s.transactions).values({ ref, receipt, method: methodFor(phone), official, ours: due - official, status: "pending", payer: phone, providerRef: prompt.providerRef }).returning({ id: s.transactions.id });
  } catch (e) {
    if (isUniqueViolation(e)) return refuse("promptWaiting");
    throw e;
  }
  try {
    const origin = SITE.url.startsWith("https://") || (process.env.NODE_ENV !== "production" && SITE.url.startsWith("http://")) ? SITE.url.replace(/\/$/, "") : "";
    const callbackUrl = origin ? `${origin}/api/payments/callback?tx=${tx.id}` : undefined;
    const sent = await prompt.provider.requestToPay({ id: prompt.id, phone9: phone, amount: due, reference: receipt, callbackUrl });
    if (sent.providerTxId) {
      const next = `${prompt.providerRef}:${sent.providerTxId}`;
      await d.update(s.transactions).set({ providerRef: next }).where(and(eq(s.transactions.id, tx.id), eq(s.transactions.status, "pending"), eq(s.transactions.providerRef, prompt.providerRef)));
    }
  } catch (e) {
    console.error("[payments]", e);
    if (e instanceof PromptRefused) {
      await d.update(s.transactions).set({ status: "failed" }).where(and(eq(s.transactions.id, tx.id), eq(s.transactions.status, "pending")));
      // The provider's code is kept for staff in the audit log, and the customer is told what they can do about it.
      await audit(d, { actor: "System", role: "—", action: "Payment prompt refused", entity: `${receipt} · ${methodFor(phone)} · IntouchPay code ${e.code ?? "none"}` }).catch(() => {});
      return refuse(REFUSAL_ERROR[refusalKind(e.code ?? "")]);
    }
    // Unknown whether the prompt went out: leave it waiting. The check on the customer's screen and the scheduled job
    // ask the provider, and close it as failed after fifteen minutes if it never existed.
    await d.update(s.requests).set({ quote: "approved" }).where(eq(s.requests.ref, ref));
    return { ok: true, txId: tx.id, receipt };
  }
  await d.update(s.requests).set({ quote: "approved" }).where(eq(s.requests.ref, ref));
  return { ok: true, txId: tx.id, receipt };
}

/** Asks the provider whether the prompt was approved, and records the result once. */
export async function checkPayment(txId: number): Promise<Result<{ status: "pending" | "paid" | "failed" }>> {
  const d = await db();
  const [t] = await d.select().from(s.transactions).where(eq(s.transactions.id, txId));
  if (!t) return refuse("payment");
  const own = await ownRequest(t.ref);
  if (!own) return refuse("payment");
  const status = (await reconcilePayment(txId)) ?? "failed";
  if (status !== "pending") revalidatePath(`/portal/requests/${t.ref}`);
  return { ok: true, status };
}

export async function markNotificationsRead() {
  const accountId = await requireCustomerId();
  await (await db()).update(s.notifications).set({ unread: false }).where(eq(s.notifications.accountId, accountId));
  revalidatePath("/portal", "layout");
}

/** A customer can cancel while nothing has been paid and nothing has been submitted. */
export async function cancelRequest(ref: string, reason: string): Promise<Result> {
  const own = await ownRequest(ref);
  if (!own) return refuse("request");
  const d = own.d;
  const [r] = await d.select().from(s.requests).where(eq(s.requests.ref, ref));
  if (r.closed || r.stage === "completed") return refuse("finished");
  if (r.stage === "institution") return refuse("withInstitution");
  const txs = await d.select().from(s.transactions).where(eq(s.transactions.ref, ref));
  if (txs.some((t) => t.status === "paid" || t.status === "pending")) return refuse("alreadyPaid");
  const why = reason.trim().slice(0, 500);
  const closedMsg = why ? msg("closed.byCustomer", { why }) : msg("closed.byCustomerNoReason");
  const summary = msg("sum.cancelledByCustomer");
  await d.transaction(async (tx) => {
    await tx.update(s.requests).set({
      closed: { kind: "cancelled", at: new Date().toISOString(), reason: english(closedMsg), msg: closedMsg },
      hold: null, summary: { title: english(summary, "title"), body: english(summary, "body"), msg: summary }, next: english(summary, "next"),
    }).where(eq(s.requests.ref, ref));
    await event(tx, ref, msg("ev.cancelledByCustomer"), "customer", why || undefined);
    await audit(tx, { actor: own.name, role: "Customer", action: "Cancelled request", entity: ref });
  });
  revalidatePath("/portal", "layout");
  return { ok: true };
}

// ---------------- account ----------------
const LANGUAGES = ["Kinyarwanda", "English", "French"] as const;

/** Name, WhatsApp updates and preferred languages. The sign-in email is changed with requestEmailChange. */
export async function updateAccount(fd: FormData): Promise<Result> {
  const accountId = await requireCustomerId("/portal/account");
  const name = text(fd, "name").replace(/\s+/g, " ").slice(0, 120);
  if (name.length < 2) return refuse("name");
  const languages = LANGUAGES.filter((l) => fd.getAll("languages").includes(l));
  const whatsapp = fd.get("whatsapp") === "on";
  // The language of their portal and of every SMS; unchanged when the form doesn't send one.
  const locale = fd.get("locale") === null ? undefined : asLocale(text(fd, "locale"));
  const d = await db();
  await d.transaction(async (tx) => {
    await tx.update(s.accounts).set({ name, first: name.split(" ")[0], whatsapp, languages, ...(locale ? { locale } : {}) }).where(eq(s.accounts.id, accountId));
    // The account holder's own profile carries the same name.
    await tx.update(s.profiles).set({ name }).where(and(eq(s.profiles.accountId, accountId), eq(s.profiles.relation, "self")));
    await audit(tx, { actor: name, role: "Customer", action: "Updated account details", entity: accountId });
  });
  if (locale) await rememberLocale(locale);
  revalidatePath("/portal", "layout");
  return { ok: true };
}

/** Step 1 of adding or changing the sign-in email: emails a code to the new address. */
export async function requestEmailChange(emailInput: string): Promise<Result<{ demoCode?: string }>> {
  const accountId = await requireCustomerId("/portal/account");
  const email = normaliseEmail(emailInput);
  if (!email) return refuse("badEmail");
  if (!(await allowIp("code"))) return refuse("tooMany");
  const [other] = await (await db()).select({ id: s.accounts.id }).from(s.accounts).where(and(sql`lower(${s.accounts.email}) = ${email}`, ne(s.accounts.id, accountId)));
  if (other) return refuse("emailTaken");
  const sent = await issueEmailCode(email, await customerLocale(), "confirm");
  return sent.ok ? { ok: true, demoCode: sent.demoCode } : fail(sent.error);
}

/** Step 2: the code proves the address is theirs, then it becomes how they sign in. */
export async function confirmEmailChange(emailInput: string, code: string): Promise<Result<{ email: string }>> {
  const accountId = await requireCustomerId("/portal/account");
  if (!(await allowIp("signIn"))) return refuse("tooMany");
  const checked = await consumeEmailCode(emailInput, code);
  if (!checked.ok) return checked;
  const d = await db();
  try {
    await d.transaction(async (tx) => {
      await tx.update(s.accounts).set({ email: checked.email }).where(eq(s.accounts.id, accountId));
      await audit(tx, { actor: accountId, role: "Customer", action: "Changed sign-in email", entity: accountId });
    });
    // Whoever else was signed in (a lost phone, a shared computer) is signed out when the sign-in address changes.
    await endOtherSessions("customer", accountId);
  } catch {
    // Someone confirmed the same address a moment earlier: the unique index refuses a second account.
    return refuse("emailTaken");
  }
  revalidatePath("/portal", "layout");
  return { ok: true, email: checked.email };
}

/** Ends every session of this account, on every phone and computer, this one included. */
export async function signOutEverywhere() {
  const accountId = await requireCustomerId("/portal/account");
  const d = await db();
  await d.delete(s.sessions).where(and(eq(s.sessions.kind, "customer"), eq(s.sessions.subjectId, accountId)));
  await audit(d, { actor: accountId, role: "Customer", action: "Signed out everywhere", entity: accountId });
  await endSession();
  redirect("/sign-in");
}

/** Deletes the documents the customer uploaded for requests that are finished. */
export async function deleteMyDocuments(): Promise<Result<{ deleted: number }>> {
  const accountId = await requireCustomerId("/portal/account");
  const { refs } = await finishedWithDocuments(accountId);
  if (!refs.length) return refuse("noDocs");
  const deleted = await purgeDocuments(refs, "customer");
  await audit(await db(), { actor: accountId, role: "Customer", action: "Deleted own documents", entity: `${deleted} file(s) · ${refs.join(", ")}` });
  revalidatePath("/portal", "layout");
  return { ok: true, deleted };
}

/** Deletes the account. The customer types DELETE to confirm; open requests must be finished first. */
export async function deleteMyAccount(confirmation: string): Promise<Result> {
  const accountId = await requireCustomerId("/portal/account");
  if (confirmation.trim().toUpperCase() !== "DELETE") return refuse("typeDelete");
  const result = await deleteAccount(accountId, await customerLocale());
  if (!result.ok) return result;
  await audit(await db(), { actor: accountId, role: "Customer", action: "Deleted account", entity: accountId });
  await endSession();
  redirect("/?account=deleted");
}
