"use server";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { accessPath, accessUrl } from "@/lib/access";
import { customerScope, endSession, enterRequest, requireCustomerId, requireFullCustomer } from "@/lib/auth";
import { normaliseEmail, normalisePhone, prettyMobile } from "@/lib/contact";
import { sendEmail, sendsRealEmail } from "@/lib/email";
import { getLocale } from "@/lib/i18n/locale";
import { requestReceivedMail } from "@/lib/mail";
import { redirect } from "next/navigation";
import { deleteAccount, finishedWithDocuments, purgeDocuments } from "@/lib/privacy";
import { iso } from "@/lib/db";
import { rwf } from "@/lib/format";
import { audit, db, event, fail, invoiceFor, nextNumber, notify, refFor, s, type Result } from "@/lib/mutate";
import { reconcilePayment } from "@/lib/billing";
import { methodFor, providerFor } from "@/lib/payments";
import { SITE } from "@/lib/site";
import { amountDue } from "@/lib/status";
import { getService } from "@/lib/repo";
import { TOO_MANY, allow, allowIp } from "@/lib/ratelimit";
import { ALLOWED, MAX_BYTES, humanSize, putFile } from "@/lib/storage";

const id = (prefix: string) => `${prefix}-${randomBytes(6).toString("hex")}`;
const maskId = (d: string) => (d.length === 16 ? `${d[0]} ${d.slice(1, 5)} ${d[5]} •••• ${d[13]} ${d.slice(14)}` : null);
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function checkFile(f: File): string | null {
  if (f.size > MAX_BYTES) return `${f.name} is larger than 10 MB. Try a photo instead of a scan, or compress the PDF.`;
  if (!ALLOWED.test(f.type)) return `${f.name}: please upload a PDF, JPG or PNG.`;
  return null;
}

/** Sends a new request. No sign-in and no code: the customer leaves an email address, gets a private link
 *  to their request on screen and by email, and the account behind it is created if it is new. The link
 *  opens a session limited to this request. */
export async function submitRequest(fd: FormData): Promise<Result<{ ref: string; link: string; emailed: boolean }>> {
  // A field real people never see. Bots fill it in and are told it worked.
  if (text(fd, "website")) return { ok: true, ref: "INZ-0000-00000", link: "/", emailed: false };
  // Without the secret there is no way to give the customer their link, so don't take the request at all.
  try { accessPath("INZ-2000-00000", 1); } catch (e) { console.error("[access]", e); return fail("We can’t take new requests right now. Please message us on WhatsApp and we’ll open it for you."); }
  const phone = normalisePhone(text(fd, "phone"));
  const email = normaliseEmail(text(fd, "email"));
  const name = text(fd, "name"), subject = text(fd, "subject"), forWho = text(fd, "forWho") || "me";
  const nid = text(fd, "nid").replace(/\D/g, "");
  if (!email) return fail("Enter a valid email address, e.g. name@example.com.");
  if (!phone) return fail("Enter a Rwandan mobile number.");
  if (!name) return fail("Enter your full name.");
  const slug = text(fd, "slug") || "other-online-service";
  const service = await getService(slug);
  if (!service || (!service.visible && slug !== "other-online-service")) return fail("That service is not available.");
  const files = service.documents.map((_, i) => fd.get(`file-${i}`)).map((f) => (f instanceof File && f.size ? f : null));
  const extra = fd.getAll("file-extra").filter((f): f is File => f instanceof File && f.size > 0);
  for (const f of [...files, ...extra]) { const bad = f && checkFile(f); if (bad) return fail(bad); }

  // Anyone can send a request, so both the connection and the address are limited.
  if (!(await allowIp("request")) || !(await allow(`request:email:${email}`, 4, 60 * 60e3))) return fail(TOO_MANY);

  const locale = await getLocale();
  const d = await db();
  const now = new Date().toISOString();
  const result = await d.transaction(async (tx) => {
    let [account] = await tx.select().from(s.accounts).where(eq(s.accounts.email, email));
    if (!account) {
      [account] = await tx.insert(s.accounts).values({ id: id("acc"), name, first: name.split(" ")[0], phone, email, locale, languages: [] }).returning();
    }
    const profiles = await tx.select().from(s.profiles).where(eq(s.profiles.accountId, account.id));
    // Nothing here was verified, so an existing profile is reused but never changed.
    let profile =
      forWho === "me" ? profiles.find((p) => p.relation === "self")
      : forWho === "business" ? profiles.find((p) => p.kind === "business" && p.name.toLowerCase() === subject.toLowerCase())
      : profiles.find((p) => p.relation === "family" && p.name.toLowerCase() === subject.toLowerCase());
    if (!profile) {
      [profile] = await tx.insert(s.profiles).values({
        id: id("p"), accountId: account.id, kind: forWho === "business" ? "business" : "person", name: forWho === "me" ? name : subject || name,
        relation: forWho === "business" ? null : forWho === "me" ? "self" : "family", idMasked: maskId(nid), nationalId: nid || null,
      }).returning();
    }

    const ref = refFor(await nextNumber(tx, "request"));
    const invoice = invoiceFor(await nextNumber(tx, "invoice"));
    await tx.insert(s.requests).values({
      ref, serviceSlug: service.slug, profileId: profile.id, agentId: null, stage: "received", stageDates: { received: now }, channel: service.channel,
      summary: { title: "We’ve received your request", body: `An agent will check it within 2 working hours and contact you on +250 ${prettyMobile(phone)}.` },
      next: "An agent checks your request within 2 working hours.", purpose: text(fd, "purpose") || null,
      invoice, official: service.official.mode ? null : service.official.amount, officialMode: service.official.mode ?? null,
      officialLabel: service.official.mode === "none" ? "Official fee" : `${service.official.label ?? "Official fee"} · ${service.channel}`,
      ours: service.ours, oursStandard: service.ours, oursUnit: service.oursUnit ?? null, quote: "estimate",
      officialReceipt: service.official.mode ? "na" : "awaiting",
    });

    const docs = service.documents.map((doc, i) => ({ id: `${ref}-d${i + 1}`, ref, position: i, name: doc.name, group: doc.group, required: doc.required, status: "required" as const }));
    const uploads: { docId: string | null; file: File }[] = [...files.map((f, i) => (f ? { docId: docs[i].id, file: f } : null)).filter((x) => !!x), ...extra.map((f) => ({ docId: null, file: f }))];
    for (const u of uploads) {
      const fileId = id("f");
      await putFile(`${ref}/${fileId}`, new Uint8Array(await u.file.arrayBuffer()), u.file.type);
      await tx.insert(s.files).values({ id: fileId, ref, storageKey: `${ref}/${fileId}`, name: u.file.name, mime: u.file.type, bytes: u.file.size, uploadedBy: "customer" });
      const doc = docs.find((x) => x.id === u.docId);
      if (doc) Object.assign(doc, { status: "received", fileId, fileName: u.file.name, fileSize: humanSize(u.file.size), uploadedAt: now });
      else docs.push({ id: `${ref}-x${docs.length + 1}`, ref, position: docs.length, name: u.file.name, group: "Other", required: false, status: "received", ...{ fileId, fileName: u.file.name, fileSize: humanSize(u.file.size), uploadedAt: now } } as never);
    }
    if (docs.length) await tx.insert(s.requestDocuments).values(docs);

    const notes = text(fd, "notes");
    if (notes) await tx.insert(s.messages).values({ ref, by: "customer", body: notes });
    // The account may already have another number; the agent should call the one given with this request.
    if (account.phone !== phone) await tx.insert(s.messages).values({ ref, by: "customer", body: `Phone for this request: +250 ${prettyMobile(phone)}` });
    await event(tx, ref, "Request opened", "customer", text(fd, "purpose") || undefined);
    await tx.insert(s.notifications).values({ accountId: account.id, icon: "check", title: `Request received: ${service.name} · ${ref}`, href: `/portal/requests/${ref}` });
    await audit(tx, { actor: account.name, role: "Customer", action: "Opened request", entity: `${ref} · ${service.name}` });
    return { ref, accountId: account.id, locale: account.locale, name: account.name };
  });

  // The browser that sent the request can follow it straight away; the email makes it work anywhere.
  await enterRequest(result.accountId, result.ref).catch((e) => console.error("[session]", e));
  const emailed = await sendEmail(requestReceivedMail({ to: email, name: result.name, service: service.name, ref: result.ref, phone: prettyMobile(phone), link: accessUrl(result.ref, 1), locale: result.locale }))
    .then(() => sendsRealEmail(), (e) => { console.error("[email]", e); return false; });
  revalidatePath("/", "layout");
  return { ok: true, ref: result.ref, link: accessPath(result.ref, 1), emailed };
}

/** Confirms the request belongs to the signed-in customer. */
async function ownRequest(ref: string) {
  const accountId = await requireCustomerId();
  // A private-link session reaches its own request and nothing else.
  const scope = await customerScope();
  if (scope && scope !== ref) return null;
  const d = await db();
  const [row] = await d.select({ ref: s.requests.ref, accountId: s.profiles.accountId, name: s.accounts.name })
    .from(s.requests).innerJoin(s.profiles, eq(s.profiles.id, s.requests.profileId)).innerJoin(s.accounts, eq(s.accounts.id, s.profiles.accountId))
    .where(eq(s.requests.ref, ref));
  return row && row.accountId === accountId ? { d, name: row.name } : null;
}

export async function sendMessage(ref: string, body: string): Promise<Result> {
  const own = await ownRequest(ref);
  if (!own) return fail("Request not found.");
  if (!body.trim()) return fail("Write a message first.");
  await own.d.insert(s.messages).values({ ref, by: "customer", body: body.trim().slice(0, 4000) });
  revalidatePath(`/portal/requests/${ref}`);
  return { ok: true };
}

/** Uploads or replaces one document on a request. */
export async function uploadDocument(fd: FormData): Promise<Result> {
  const docId = text(fd, "docId");
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return fail("Choose a file first.");
  const bad = checkFile(file);
  if (bad) return fail(bad);
  const d = await db();
  const [doc] = await d.select().from(s.requestDocuments).where(eq(s.requestDocuments.id, docId));
  if (!doc) return fail("Document not found.");
  const own = await ownRequest(doc.ref);
  if (!own) return fail("Document not found.");
  const fileId = id("f");
  await putFile(`${doc.ref}/${fileId}`, new Uint8Array(await file.arrayBuffer()), file.type);
  await d.transaction(async (tx) => {
    await tx.insert(s.files).values({ id: fileId, ref: doc.ref, storageKey: `${doc.ref}/${fileId}`, name: file.name, mime: file.type, bytes: file.size, uploadedBy: "customer" });
    await tx.update(s.requestDocuments).set({ status: "received", fileId, fileName: file.name, fileSize: humanSize(file.size), uploadedAt: new Date().toISOString(), note: null, reviewedAt: null, reviewedBy: null })
      .where(eq(s.requestDocuments.id, docId));
    await event(tx, doc.ref, "Document uploaded", "customer", doc.name);
    await audit(tx, { actor: own.name, role: "Customer", action: "Uploaded document", entity: `${doc.ref} · ${doc.name}` });
  });
  revalidatePath("/portal", "layout");
  return { ok: true };
}

/** Approves the quote and sends a mobile money prompt for what is still due. */
export async function startPayment(ref: string, phoneInput: string): Promise<Result<{ txId: number; receipt: string }>> {
  const own = await ownRequest(ref);
  if (!own) return fail("Request not found.");
  const phone = normalisePhone(phoneInput);
  if (!phone) return fail("Enter the MoMo or Airtel Money number to charge, e.g. 788 123 456.");
  const d = own.d;
  const [r] = await d.select().from(s.requests).where(eq(s.requests.ref, ref));
  if (r.quote === "estimate") return fail("Your agent has not confirmed the amounts yet.");
  if (!(await allowIp("payment"))) return fail(TOO_MANY);
  const txs = await d.select().from(s.transactions).where(eq(s.transactions.ref, ref));
  const billing = { ...r, official: r.official, officialMode: r.officialMode ?? undefined, transactions: txs.map((t) => ({ ...t, at: iso(t.at)! })) } as never;
  const due = amountDue(billing);
  if (due <= 0) return fail("Nothing is due on this request.");
  const paidOfficial = txs.filter((t) => t.status === "paid").reduce((n, t) => n + t.official, 0);
  const official = Math.max(0, (r.official ?? 0) - paidOfficial);
  if (txs.some((t) => t.status === "pending")) return fail("A payment prompt is already waiting on your phone. Approve it, or wait a few minutes and try again.");
  const receipt = txs.length ? `${r.invoice}-${txs.length + 1}` : r.invoice;
  // Record the attempt first, so a callback that arrives quickly always finds it.
  const [tx] = await d.insert(s.transactions).values({ ref, receipt, method: methodFor(phone), official, ours: due - official, status: "pending", payer: phone, providerRef: "" }).returning({ id: s.transactions.id });
  try {
    const callbackUrl = SITE.url.startsWith("http") ? `${SITE.url}/api/payments/callback?tx=${tx.id}` : undefined;
    const { providerRef } = await providerFor(phone).requestToPay({ phone9: phone, amount: due, reference: receipt, callbackUrl });
    await d.update(s.transactions).set({ providerRef }).where(eq(s.transactions.id, tx.id));
  } catch (e) {
    console.error("[payments]", e);
    await d.update(s.transactions).set({ status: "failed" }).where(eq(s.transactions.id, tx.id));
    return fail("We couldn’t reach mobile money just now. Nothing was charged. Please try again.");
  }
  await d.update(s.requests).set({ quote: "approved" }).where(eq(s.requests.ref, ref));
  return { ok: true, txId: tx.id, receipt };
}

/** Asks the provider whether the prompt was approved, and records the result once. */
export async function checkPayment(txId: number): Promise<Result<{ status: "pending" | "paid" | "failed" }>> {
  const d = await db();
  const [t] = await d.select().from(s.transactions).where(eq(s.transactions.id, txId));
  if (!t) return fail("Payment not found.");
  const own = await ownRequest(t.ref);
  if (!own) return fail("Payment not found.");
  const status = (await reconcilePayment(txId)) ?? "failed";
  if (status !== "pending") revalidatePath(`/portal/requests/${t.ref}`);
  return { ok: true, status };
}

export async function markNotificationsRead() {
  const accountId = await requireCustomerId();
  const scope = await customerScope();
  await (await db()).update(s.notifications).set({ unread: false })
    .where(and(eq(s.notifications.accountId, accountId), scope ? eq(s.notifications.href, `/portal/requests/${scope}`) : undefined));
  revalidatePath("/portal", "layout");
}

/** A customer can cancel while nothing has been paid and nothing has been submitted. */
export async function cancelRequest(ref: string, reason: string): Promise<Result> {
  const own = await ownRequest(ref);
  if (!own) return fail("Request not found.");
  const d = own.d;
  const [r] = await d.select().from(s.requests).where(eq(s.requests.ref, ref));
  if (r.closed || r.stage === "completed") return fail("This request is already finished.");
  if (r.stage === "institution") return fail("This request is already with the institution. Message your agent to stop it.");
  const txs = await d.select().from(s.transactions).where(eq(s.transactions.ref, ref));
  if (txs.some((t) => t.status === "paid" || t.status === "pending")) return fail("You have already paid for this request. Message your agent to cancel it and arrange a refund.");
  const why = reason.trim().slice(0, 500);
  await d.transaction(async (tx) => {
    await tx.update(s.requests).set({
      closed: { kind: "cancelled", at: new Date().toISOString(), reason: why ? `Cancelled by you: ${why}` : "Cancelled by you." },
      hold: null, summary: { title: "Cancelled", body: "You cancelled this request. Nothing was charged." }, next: "Closed.",
    }).where(eq(s.requests.ref, ref));
    await event(tx, ref, "Cancelled by the customer", "customer", why || undefined);
    await audit(tx, { actor: own.name, role: "Customer", action: "Cancelled request", entity: ref });
  });
  revalidatePath("/portal", "layout");
  return { ok: true };
}

// ---------------- account ----------------
const LANGUAGES = ["Kinyarwanda", "English", "French"] as const;

/** Name, WhatsApp updates and preferred languages. The email address is the sign-in, so support changes it. */
export async function updateAccount(fd: FormData): Promise<Result> {
  const accountId = await requireFullCustomer("/portal/account");
  const name = text(fd, "name").replace(/\s+/g, " ").slice(0, 120);
  if (name.length < 2) return fail("Enter your full name.");
  const languages = LANGUAGES.filter((l) => fd.getAll("languages").includes(l));
  const whatsapp = fd.get("whatsapp") === "on";
  const d = await db();
  await d.transaction(async (tx) => {
    await tx.update(s.accounts).set({ name, first: name.split(" ")[0], whatsapp, languages }).where(eq(s.accounts.id, accountId));
    // The account holder's own profile carries the same name.
    await tx.update(s.profiles).set({ name }).where(and(eq(s.profiles.accountId, accountId), eq(s.profiles.relation, "self")));
    await audit(tx, { actor: name, role: "Customer", action: "Updated account details", entity: accountId });
  });
  revalidatePath("/portal", "layout");
  return { ok: true };
}

/** Ends every session of this account, on every phone and computer, this one included. */
export async function signOutEverywhere() {
  const accountId = await requireFullCustomer("/portal/account");
  const d = await db();
  await d.delete(s.sessions).where(and(eq(s.sessions.kind, "customer"), eq(s.sessions.subjectId, accountId)));
  await audit(d, { actor: accountId, role: "Customer", action: "Signed out everywhere", entity: accountId });
  await endSession();
  redirect("/sign-in");
}

/** Deletes the documents the customer uploaded for requests that are finished. */
export async function deleteMyDocuments(): Promise<Result<{ deleted: number }>> {
  const accountId = await requireFullCustomer("/portal/account");
  const { refs } = await finishedWithDocuments(accountId);
  if (!refs.length) return fail("There are no documents from finished requests to delete.");
  const deleted = await purgeDocuments(refs, "at the customer’s request");
  await audit(await db(), { actor: accountId, role: "Customer", action: "Deleted own documents", entity: `${deleted} file(s) · ${refs.join(", ")}` });
  revalidatePath("/portal", "layout");
  return { ok: true, deleted };
}

/** Deletes the account. The customer types DELETE to confirm; open requests must be finished first. */
export async function deleteMyAccount(confirmation: string): Promise<Result> {
  const accountId = await requireFullCustomer("/portal/account");
  if (confirmation.trim().toUpperCase() !== "DELETE") return fail("Type DELETE to confirm.");
  const result = await deleteAccount(accountId);
  if (!result.ok) return result;
  await audit(await db(), { actor: accountId, role: "Customer", action: "Deleted account", entity: accountId });
  await endSession();
  redirect("/?account=deleted");
}
