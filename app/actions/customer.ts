"use server";
import { randomBytes } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { consumeCode, consumeEmailCode, endOtherSessions, endSession, getSession, issueEmailCode, normaliseEmail, normalisePhone, requireCustomerId, startSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { deleteAccount, finishedWithDocuments, purgeDocuments } from "@/lib/privacy";
import { iso } from "@/lib/db";
import { primeContent } from "@/lib/content";
import { asLocale, getLocale, rememberLocale, type Locale } from "@/lib/i18n/locale";
import { text as tr } from "@/lib/i18n/messages";
import type en from "@/lib/i18n/en.json";
import type { DeliverVia, LibraryDoc, ServiceAnswer } from "@/lib/types";
import { english, feeVars, msg, sms } from "@/lib/i18n/stored";
import { checkoutPrice, reviewFeeFor, withOption } from "@/lib/pricing";
import { cleanAnswer, isAsked } from "@/lib/identifiers";
import { localizeService } from "@/lib/i18n/present";
import { maskNationalId, parseDob, prettyPhone, rwf } from "@/lib/format";
import { idAsk, idPolicyOf, mentionsNationalId, nationalIdDigits, nationalIdError } from "@/lib/identity";
import { open, seal } from "@/lib/crypto";
import { audit, db, event, fail, invoiceFor, nextNumber, notify, refFor, s, type Result } from "@/lib/mutate";
import { reconcileForScreen, reconcilePayment } from "@/lib/billing";
import { isUniqueViolation } from "@/lib/db/errors";
import { isReservedTestEmail } from "@/lib/email";
import { refusalKind, type RefusalKind } from "@/lib/intouchpay";
import { PromptRefused, methodFor, newPrompt } from "@/lib/payments";
import { withLocale } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { payableNow } from "@/lib/status";
import { getService, listMyDocuments } from "@/lib/repo";
import { notifyStaff } from "@/lib/staff-alerts";
import { TOO_MANY, allowFor, allowIp, clientIp } from "@/lib/ratelimit";
import { hasLink, issueLink, keepLink } from "@/lib/request-links";
import { verifyHuman } from "@/lib/turnstile";
import { ALLOWED, MAX_BYTES, checkUpload, deleteFile, humanSize, putFile, sniffType } from "@/lib/storage";

/** A file whose content is not what it claimed to be. */
class BadFile extends Error {}
const id = (prefix: string) => `${prefix}-${randomBytes(6).toString("hex")}`;
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Errors are written in the customer's language: their account's once signed in, else the browser's. */
async function customerLocale(): Promise<Locale> {
  const session = await getSession();
  if (session?.kind !== "customer") return getLocale();
  await primeContent(); // a signed-in customer's language comes from their account, so getLocale() did not load the Kinyarwanda edits
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

/** At most this many files arrive with a new request; more can be added from the portal. */
const MAX_START_FILES = 15;

/** Sends a new request, with no account and no code: the way most people use Irembo. The mobile money PIN that pays it
 *  is what proves the number. A signed-in customer's request joins their account. Anyone else's gets a contact record of
 *  its own and keeps the WhatsApp number and email on the request, so a number or address typed here never joins or
 *  opens an existing account. Its private link (lib/request-links.ts) is kept in this browser and arrives with the
 *  receipt, so they can follow it, add documents and answer us without signing in. */
export async function submitRequest(fd: FormData): Promise<Result<{ ref: string; signedIn: boolean; payNow: number | null }>> {
  const session = await getSession();
  const signedIn = session?.kind === "customer" ? session.subjectId : null;
  const via: DeliverVia = text(fd, "via") === "email" ? "email" : "whatsapp";
  const phoneInput = text(fd, "phone");
  const typedPhone = phoneInput ? normalisePhone(phoneInput) : null;
  const emailInput = text(fd, "email");
  const email = emailInput ? normaliseEmail(emailInput) : null;
  const name = text(fd, "name"), subject = text(fd, "subject"), forWho = text(fd, "forWho") || "me";
  const digits = nationalIdDigits(text(fd, "nid"));
  if (emailInput && !email) return refuse("badEmail");
  if (via === "email" && !email) return refuse("badEmail");
  if (phoneInput && !typedPhone) return refuse("badPhone");
  if (via === "whatsapp" && !typedPhone) return refuse("badPhone");
  if (!name) return refuse("name");
  const slug = text(fd, "slug") || "other-online-service";
  const service = await getService(slug);
  if (!service || (!service.visible && slug !== "other-online-service")) return refuse("service");
  // Pay to submit. A service whose price the catalogue settles is paid in full; any other starts with a review fee, taken
  // off our fee when the quote is paid. Either way the request reaches staff once that payment is in (lib/billing.ts).
  // A service priced by option (passport type, test type) is priced by the one the customer picked.
  const optionRaw = text(fd, "option");
  const optionIndex = optionRaw === "" ? null : Number(optionRaw);
  const priced = withOption(service, optionIndex);
  if (!priced) return refuse("option");
  const price = checkoutPrice(priced);
  const reviewFee = reviewFeeFor(priced);
  const payFirst = price ? price.total : reviewFee;
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
  }
  // The service's own questions. Answers keep the English label, which is what staff read. A question tied to a purpose
  // (the ticket number, or the plate and TIN) is asked only for that purpose, found by its place in either language.
  const purpose = text(fd, "purpose");
  const purposeIndex = [service.purposes, localizeService(service, "rw").purposes].map((list) => list?.indexOf(purpose) ?? -1).find((i) => i >= 0) ?? -1;
  const answers: ServiceAnswer[] = [];
  if (optionIndex !== null && service.feeOptions?.[optionIndex]) answers.push({ key: "option", label: service.feeOptionLabel ?? "Option", value: service.feeOptions[optionIndex].label });
  for (const q of service.questions ?? []) {
    if (!isAsked(q, purposeIndex)) continue;
    const value = text(fd, `answer-${q.key}`).slice(0, 400);
    if (q.required && !value) return refuse("answer", { q: q.label });
    if (!value) continue;
    const clean = cleanAnswer(q.kind, value);
    if (clean === null) return refuse("answerFormat", { q: q.label });
    answers.push({ key: q.key, label: q.label, value: clean });
  }
  const isFile = (f: FormDataEntryValue): f is File => f instanceof File && f.size > 0;
  const files = service.documents.map((_, i) => fd.getAll(`file-${i}`).filter(isFile));
  const extra = fd.getAll("file-extra").filter(isFile);
  if (files.flat().length + extra.length > MAX_START_FILES) return refuse("tooManyFiles", { n: MAX_START_FILES });
  for (const f of [...files.flat(), ...extra]) { const bad = await checkFile(f); if (bad) return fail(bad); }

  if (!(await allowIp("request"))) return refuse("tooMany");
  // No code, so bots are stopped here: Turnstile for everyone who is not signed in.
  if (!signedIn && !(await verifyHuman(text(fd, "human"), await clientIp()))) return refuse("notHuman");

  const d = await db();
  const now = new Date().toISOString();
  // Asked before the transaction: it may read the database, which the transaction must not wait on.
  const visitorLocale = await getLocale();
  // Files are written inside the transaction; if it fails, the ones already stored are removed so none is left behind.
  const stored: string[] = [];
  const result = await d.transaction(async (tx) => {
    // Signed in: their own account. Otherwise a contact record of its own, with no phone or email on it (those stay on
    // the request), in the language they used to send it.
    let [account] = signedIn ? await tx.select().from(s.accounts).where(eq(s.accounts.id, signedIn)) : [];
    if (!account) {
      [account] = await tx.insert(s.accounts).values({
        id: id("acc"), name, first: name.split(" ")[0], phone: null, email: null, languages: [], locale: visitorLocale, registeredAt: null,
      }).returning();
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
    // Pay to submit: a request with a settled price waits at checkout, out of the staff queues, until it is paid
    // (lib/billing.ts hands it over). The customer sees it in their portal as one thing to do: pay.
    const total = payFirst ? rwf(payFirst) : "";
    const summary = price ? msg("sum.checkout", { total }) : reviewFee ? msg("sum.reviewFee", { fee: total }) : msg("sum.received", { contact: email ?? prettyPhone(typedPhone) });
    const checkoutHold = price ? msg("hold.checkout", { total }) : reviewFee ? msg("hold.reviewFee", { fee: total }) : null;
    await tx.insert(s.requests).values({
      ref, serviceSlug: service.slug, profileId: profile.id, agentId: null, stage: "received", stageDates: { received: now }, channel: service.channel,
      checkout: payFirst ? "open" : "none", reviewFee,
      hold: checkoutHold ? { reason: "payment", title: english(checkoutHold, "title"), detail: english(checkoutHold, "detail"), since: now, msg: checkoutHold } : null,
      summary: { title: english(summary, "title"), body: english(summary, "body"), msg: summary },
      next: english(summary, "next"), purpose: purpose || null, answers: answers.length ? answers : null, deliverVia: via,
      contactPhone: typedPhone, contactEmail: email,
      idPolicy: policy, idRequired: ask === "required", idReview: ask === "required" ? "pending" : null, idConsent: storeId && consent,
      requirementsSnapshot: service.requirements,
      invoice, official: priced.official.mode ? null : priced.official.amount, officialMode: priced.official.mode ?? null,
      officialLabel: service.official.mode === "none" ? "Official fee" : `${service.official.label ?? "Official fee"} · ${service.channel}`,
      ours: service.ours, oursStandard: service.ours, oursUnit: service.oursUnit ?? null, quote: price ? "confirmed" : "estimate",
      // An unpaid checkout is reminded once and closed after three days (lib/jobs.ts).
      ...(price ? { dueAt: new Date(Date.now() + 3 * 864e5).toISOString() } : {}),
      officialReceipt: service.official.mode || service.official.amount === 0 ? "na" : "awaiting",
    });

    const docs = service.documents.map((doc, i) => ({ id: `${ref}-d${i + 1}`, ref, position: i, name: doc.name, group: doc.group, required: doc.required, status: "required" as const }));
    // The first file for a document fills its slot; any more are kept beside it as extra files.
    const uploads: { docId: string | null; file: File }[] = [...files.flatMap((list, i) => list.map((f, j) => ({ docId: j === 0 ? docs[i].id : null, file: f }))), ...extra.map((f) => ({ docId: null, file: f }))];
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
    if (price) await event(tx, ref, msg("ev.feesConfirmed", { ...feeVars(priced.official.mode, price.official), ours: rwf(price.ours) }), "system");
    if (payFirst) {
      // Staff hear about it, and the customer is told it was received, once it is paid.
      await audit(tx, { actor: account.name, role: "Customer", action: price ? "Started a request at checkout" : "Started a request with a review fee", entity: `${ref} · ${service.name} · ${total}` });
    } else {
      const received = msg("nt.received", { service: service.name, serviceSlug: service.slug, ref });
      await tx.insert(s.notifications).values({ accountId: account.id, icon: "check", title: english(received), key: received.key, vars: received.vars, href: `/portal/requests/${ref}` });
      await audit(tx, { actor: account.name, role: "Customer", action: "Opened request", entity: `${ref} · ${service.name}` });
      await notifyStaff(tx, ref, { kind: "new", icon: "inbox", title: `New request ${ref}`, body: `${account.name} · ${service.name}` });
    }
    // Someone without an account follows it with its private link, kept in this browser from now on.
    const token = signedIn ? null : await issueLink(tx, ref);
    return { ref, token };
  }).catch(async (e) => {
    await Promise.all(stored.map((key) => deleteFile(key).catch(() => {})));
    if (e instanceof BadFile) return null;
    throw e;
  });
  if (!result) return refuse("fileType", { name: "your file" });

  if (result.token) await keepLink(result.ref, result.token);
  revalidatePath("/", "layout");
  return { ok: true, ref: result.ref, signedIn: !!signedIn, payNow: payFirst };
}

/** Who may act on a request: the signed-in customer whose request it is, or a browser holding its private link. */
async function ownRequest(ref: string) {
  const d = await db();
  const [row] = await d.select({ ref: s.requests.ref, accountId: s.profiles.accountId, name: s.accounts.name, email: s.accounts.email, contactEmail: s.requests.contactEmail })
    .from(s.requests).innerJoin(s.profiles, eq(s.profiles.id, s.requests.profileId)).innerJoin(s.accounts, eq(s.accounts.id, s.profiles.accountId))
    .where(eq(s.requests.ref, ref));
  if (!row) return null;
  const session = await getSession();
  const signedIn = session?.kind === "customer" && session.subjectId === row.accountId;
  if (!signedIn && !(await hasLink(ref))) return null;
  return { d, name: row.name, email: row.email ?? row.contactEmail, signedIn };
}
/** Refreshes both places a request is shown to its owner. */
const refreshRequest = (ref: string) => { revalidatePath(`/portal/requests/${ref}`); revalidatePath(`/r/${ref}`); };

export async function sendMessage(ref: string, body: string): Promise<Result> {
  const own = await ownRequest(ref);
  if (!own) return refuse("request");
  if (!body.trim()) return refuse("message");
  if (!(await allowIp("portal"))) return refuse("tooMany");
  const text = body.trim().slice(0, 4000);
  await own.d.transaction(async (tx) => {
    await tx.insert(s.messages).values({ ref, by: "customer", body: text });
    await notifyStaff(tx, ref, { kind: "reply", icon: "msg", title: `${own.name} replied on ${ref}`, body: text.slice(0, 160) });
  });
  refreshRequest(ref);
  revalidatePath("/console", "layout");
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
  refreshRequest(ref);
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
  if (!(await allowIp("portal"))) return refuse("tooMany");
  const [req] = await d.select({ closed: s.requests.closed, stage: s.requests.stage }).from(s.requests).where(eq(s.requests.ref, doc.ref));
  if (!req || req.closed || req.stage === "completed") return refuse("finished");
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
    await notifyStaff(tx, doc.ref, { kind: "upload", icon: "file", title: `${own.name} uploaded ${doc.name}`, body: doc.ref });
  }); } catch (e) { await deleteFile(`${doc.ref}/${fileId}`).catch(() => {}); throw e; }
  revalidatePath("/portal", "layout");
  revalidatePath(`/r/${doc.ref}`);
  return { ok: true, docs: own.signedIn ? await listMyDocuments() : [] };
}

/** Approves the quote and sends a mobile money prompt for what is still due. */
export async function startPayment(ref: string, phoneInput: string): Promise<Result<{ txId: number; receipt: string }>> {
  const own = await ownRequest(ref);
  if (!own) return refuse("request");
  const phone = normalisePhone(phoneInput);
  if (!phone) return refuse("payPhone");
  const d = own.d;
  const [r] = await d.select().from(s.requests).where(eq(s.requests.ref, ref));
  if (r.closed) return refuse("finished");
  // A quoted request waiting at checkout pays its review fee; any other pays confirmed fees.
  const reviewing = r.checkout === "open" && !!r.reviewFee;
  if (r.quote === "estimate" && !reviewing) return refuse("notConfirmed");
  // Prompts go to a phone: a few an hour per number, so nobody can flood a stranger's phone with them.
  if (!(await allowIp("payment")) || !(await allowFor("payPhone", phone))) return refuse("tooMany");
  let txs = await d.select().from(s.transactions).where(eq(s.transactions.ref, ref));
  // A prompt left open (a closed tab, a missed callback) would block the customer until the daily job. Ask the provider
  // first: it may have been paid, or it may be old enough to close, and only a prompt still within its time stays.
  if (txs.some((t) => t.status === "pending")) {
    for (const t of txs) if (t.status === "pending") await reconcilePayment(t.id);
    txs = await d.select().from(s.transactions).where(eq(s.transactions.ref, ref));
  }
  const billing = { ...r, official: r.official, officialMode: r.officialMode ?? undefined, reviewFee: r.reviewFee ?? undefined, transactions: txs.map((t) => ({ ...t, at: iso(t.at)! })) } as never;
  const due = payableNow(billing, r.checkout === "open").amount;
  if (due <= 0) return refuse("nothingDue");
  const paidOfficial = txs.filter((t) => t.status === "paid").reduce((n, t) => n + t.official, 0);
  // A review fee is ours. On a quote, what was already paid (the review fee) comes off our fee first; were it ever more
  // than our fee, the rest comes off the official fee, so neither line goes below zero.
  const official = reviewing ? 0 : Math.min(due, Math.max(0, (r.official ?? 0) - paidOfficial));
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
    if (!reviewing) await d.update(s.requests).set({ quote: "approved" }).where(eq(s.requests.ref, ref));
    return { ok: true, txId: tx.id, receipt };
  }
  // Paying a quote approves it. Paying a review fee does not: there is no quote yet.
  if (!reviewing) await d.update(s.requests).set({ quote: "approved" }).where(eq(s.requests.ref, ref));
  return { ok: true, txId: tx.id, receipt };
}

/** Asks the provider whether the prompt was approved, and records the result once. */
export async function checkPayment(txId: number): Promise<Result<{ status: "pending" | "paid" | "failed" }>> {
  const d = await db();
  const [t] = await d.select().from(s.transactions).where(eq(s.transactions.id, txId));
  if (!t) return refuse("payment");
  const own = await ownRequest(t.ref);
  if (!own) return refuse("payment");
  const status = (await reconcileForScreen(txId)) ?? "failed";
  if (status !== "pending") refreshRequest(t.ref);
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
  revalidatePath(`/r/${ref}`);
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
  redirect(withLocale(await getLocale(), "/?account=deleted"));
}
