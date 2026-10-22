// The data-access layer: every screen reads through these functions, and only they touch the
// database. Writes live in app/actions. Only import this from server code.
import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { WORKS_CASES, canSeeCase, canTriage, caseScope, seesAllCases } from "./access";
import { getSession, requireCustomerId, requireStaff } from "./auth";
import { db, iso, schema as s } from "./db";
import { allowFor } from "./ratelimit";
import { timingSafeEqual } from "node:crypto";
import { fmtDay, isOnOrBeforeDay, kigaliMonthStart, monthShort, phoneDigits, prettyPhone, shortName } from "./format";
import type { Locale } from "./i18n/locale";
import { text } from "./i18n/messages";
import { channelName } from "./i18n/present";
import { documentNote, hasPart, legacyText, say, type Part } from "./i18n/stored";
import { PERMISSION_GROUPS, PERMISSIONS, ROLES, type Permission } from "./permissions";
import { attentionCounts, caseTargetHours, isLate, median, sourceOf, stageClock, wasReturned, workQueue } from "./dashboard";
import { amountDue, isOpen, payableNow, payStatus, STAGE_LABEL } from "./status";
import { isIdPolicy, isIdReview } from "./identity";
import { STAGES, type Account, type AuditEntry, type Category, type ClientDetail, type ClientSummary, type CustomerRequest, type Hold, type IdReview, type LibraryDoc, type Message, type Msg, type MsgVars, type Note, type Notification, type Profile, type Request, type RequestEvent, type RequestView, type SavedView, type Service, type Staff, type Stage, type StageTarget, type TrackResult } from "./types";

export const getNow = async () => new Date().toISOString();
const DAY = 864e5;

// ---------------- catalogue ----------------
type ServiceRow = typeof s.services.$inferSelect;
export const toService = (r: ServiceRow): Service => ({
  slug: r.slug, name: r.name, aka: r.aka ?? undefined, tagline: r.tagline ?? undefined, category: r.category, authority: r.authority, channel: r.channel, via: r.via, summary: r.summary,
  who: r.who, requirements: r.requirements, documents: r.documents, steps: r.steps, notes: r.notes,
  official: { amount: r.officialAmount, mode: r.officialMode ?? undefined, label: r.officialLabel ?? undefined, note: r.officialNote, verifiedAt: iso(r.officialVerifiedAt) },
  ours: r.ours, oursUnit: r.oursUnit ?? undefined, time: r.time, docsShort: r.docsShort, popular: r.popular, audience: r.audience,
  purposes: r.purposes ?? undefined, purposeLabel: r.purposeLabel ?? undefined, questions: r.questions ?? undefined, noId: r.idPolicy === "none" || r.noId, idPolicy: isIdPolicy(r.idPolicy) ? r.idPolicy : undefined, flow: r.flow ?? undefined, stageLabels: r.stageLabels ?? undefined, visible: r.visible,
});

export async function listCategories(): Promise<Category[]> {
  const rows = await (await db()).select().from(s.categories).orderBy(asc(s.categories.position));
  return rows.map((c) => ({ id: c.id, icon: c.icon, name: c.name, short: c.short, desc: c.desc, href: c.href ?? undefined }));
}
export async function listServices(opts: { includeHidden?: boolean } = {}): Promise<Service[]> {
  const d = await db();
  const rows = await d.select().from(s.services).where(opts.includeHidden ? undefined : eq(s.services.visible, true)).orderBy(asc(s.services.position));
  return rows.map(toService);
}
export async function getService(slug: string): Promise<Service | undefined> {
  const [row] = await (await db()).select().from(s.services).where(eq(s.services.slug, slug));
  return row && toService(row);
}
/** Requests opened per service in the last 30 days. */
export async function getServiceDemand(): Promise<Record<string, number>> {
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const rows = await (await db()).select({ slug: s.requests.serviceSlug, n: sql<number>`count(*)::int` }).from(s.requests).where(gte(s.requests.openedAt, since)).groupBy(s.requests.serviceSlug);
  return Object.fromEntries(rows.map((r) => [r.slug, r.n]));
}

// ---------------- stored sentences ----------------
/** A stored sentence in the reader's language: the message when the row has one, otherwise the
 *  English it was stored with. */
const told = (locale: Locale, m: Msg | null | undefined, part: Part | undefined, stored: string) => (m ? say(locale, m, part) : undefined) ?? legacyText(locale, stored);
const rowMsg = (key: string | null, vars: MsgVars | null): Msg | null => (key ? { key, vars: vars ?? undefined } : null);
const localHold = (locale: Locale, h: Hold): Hold => ({
  ...h,
  title: told(locale, h.msg, "title", h.title),
  // An information hold's detail is the agent's own question, shown as typed.
  detail: h.msg && hasPart(h.msg, "detail") ? told(locale, h.msg, "detail", h.detail) : legacyText(locale, h.detail),
});

// ---------------- loading requests ----------------
type AccountDb = typeof s.accounts.$inferSelect;
/** An account as screens receive it: the phone formatted (empty when only an email was given). */
const toAccount = (a: AccountDb): Account => ({
  id: a.id, name: a.name, first: a.first, phone: prettyPhone(a.phone), email: a.email ?? undefined, whatsapp: a.whatsapp, languages: a.languages,
  since: iso(a.since)!, registered: !!a.registeredAt, locale: a.locale,
});
type ProfileRow = typeof s.profiles.$inferSelect;
/** A profile as screens receive it: the national ID and TIN only in their masked form. */
const toProfile = (p: ProfileRow): Profile => ({
  id: p.id, accountId: p.accountId, kind: p.kind, name: p.name, relation: p.relation ?? undefined,
  idMasked: p.idMasked ?? undefined, tinMasked: p.tinMasked ?? undefined, district: p.district ?? undefined,
  dateOfBirth: p.dateOfBirth ?? undefined, idChecked: p.idCheckedAt ? iso(p.idCheckedAt) : undefined,
});

/** Loads requests with everything they point to, in a handful of queries. Stored sentences (timeline,
 *  summary, next step, hold, closing reason) come in `locale`: staff read English. */
async function loadRequests(where?: SQL, locale: Locale = "en"): Promise<RequestView[]> {
  const d = await db();
  const rows = await d.select().from(s.requests).where(where);
  if (!rows.length) return [];
  const refs = rows.map((r) => r.ref);
  const [docs, outs, msgs, nts, evs, txs, svcs, profs, staffRows] = await Promise.all([
    d.select().from(s.requestDocuments).where(inArray(s.requestDocuments.ref, refs)).orderBy(asc(s.requestDocuments.position)),
    d.select().from(s.deliverables).where(inArray(s.deliverables.ref, refs)),
    d.select().from(s.messages).where(inArray(s.messages.ref, refs)).orderBy(asc(s.messages.at), asc(s.messages.id)),
    d.select().from(s.notes).where(inArray(s.notes.ref, refs)).orderBy(asc(s.notes.at), asc(s.notes.id)),
    d.select().from(s.events).where(inArray(s.events.ref, refs)).orderBy(desc(s.events.at), desc(s.events.id)),
    d.select().from(s.transactions).where(inArray(s.transactions.ref, refs)).orderBy(asc(s.transactions.at)),
    d.select().from(s.services).where(inArray(s.services.slug, [...new Set(rows.map((r) => r.serviceSlug))])),
    d.select().from(s.profiles).where(inArray(s.profiles.id, [...new Set(rows.map((r) => r.profileId))])),
    d.select().from(s.staff),
  ]);
  const accs = await d.select().from(s.accounts).where(inArray(s.accounts.id, [...new Set(profs.map((p) => p.accountId))]));
  const by = <T extends { ref: string }>(list: T[]) => { const m = new Map<string, T[]>(); for (const x of list) m.set(x.ref, [...(m.get(x.ref) ?? []), x]); return m; };
  const docsBy = by(docs), outsBy = by(outs), msgsBy = by(msgs), notesBy = by(nts), evBy = by(evs), txBy = by(txs);

  return rows.map((r) => {
    const profile = profs.find((p) => p.id === r.profileId)!;
    const accountRow = accs.find((a) => a.id === profile.accountId)!;
    const account: Account = toAccount(accountRow);
    const service = toService(svcs.find((x) => x.slug === r.serviceSlug)!);
    const agentRow = staffRows.find((x) => x.id === r.agentId);
    const name = (who?: string | null) => (who === "customer" ? account.name : !who || who === "system" ? "System" : staffRows.find((x) => x.id === who)?.name ?? "Inzira");
    const sm = r.summary.msg;
    const req: Request = {
      ref: r.ref, serviceSlug: r.serviceSlug, title: r.title ?? undefined, profileId: r.profileId, agentId: r.agentId, openedAt: iso(r.openedAt)!,
      stage: r.stage, stageDates: r.stageDates, channel: r.channel,
      hold: r.hold ? localHold(locale, r.hold) : undefined,
      closed: r.closed ? { ...r.closed, reason: told(locale, r.closed.msg, undefined, r.closed.reason) } : undefined,
      officialRef: r.officialRef ?? undefined, officialBill: r.officialBill ?? undefined, dependsOn: r.dependsOn ?? undefined, purpose: r.purpose ?? undefined,
      answers: r.answers ?? undefined, deliverVia: r.deliverVia === "email" || r.deliverVia === "whatsapp" ? r.deliverVia : undefined,
      idPolicy: isIdPolicy(r.idPolicy) ? r.idPolicy : undefined, idRequired: r.idRequired, idReview: isIdReview(r.idReview) ? r.idReview : undefined,
      idReviewNote: r.idReviewNote ?? undefined, idReviewedAt: iso(r.idReviewAt), idReviewedBy: r.idReviewBy ?? undefined, idConsent: r.idConsent,
      requirementsSnapshot: r.requirementsSnapshot ?? undefined,
      summary: { ...r.summary, title: told(locale, sm, "title", r.summary.title), body: sm && hasPart(sm, "body") ? told(locale, sm, "body", r.summary.body) : legacyText(locale, r.summary.body) },
      next: sm && hasPart(sm, "next") ? told(locale, sm, "next", r.next) : legacyText(locale, r.next),
      followUp: r.followUp ?? undefined,
      handover: r.handover ?? undefined,
      checkout: r.checkout === "none" ? undefined : r.checkout,
      billing: {
        invoice: r.invoice, official: r.official, officialMode: r.officialMode ?? undefined, officialLabel: r.officialLabel, ours: r.ours, oursStandard: r.oursStandard,
        oursUnit: r.oursUnit ?? undefined, oursNote: r.oursNote ?? undefined, quote: r.quote, dueAt: iso(r.dueAt), officialReceipt: r.officialReceipt, reviewFee: r.reviewFee ?? undefined,
        transactions: (txBy.get(r.ref) ?? []).map((t) => ({ receipt: t.receipt, at: iso(t.at)!, method: t.method, official: t.official, ours: t.ours, status: t.status })),
      },
      documents: (docsBy.get(r.ref) ?? []).map((x) => ({
        id: x.id, name: x.name, group: x.group, required: x.required, status: x.status, note: documentNote(locale, x.note ?? undefined), reviewedAt: iso(x.reviewedAt), reviewedBy: x.reviewedBy ?? undefined,
        file: x.fileName ? { name: x.fileName, size: x.fileSize ?? "", uploadedAt: iso(x.uploadedAt)!, id: x.fileId ?? undefined } : undefined,
      })),
      deliverables: (outsBy.get(r.ref) ?? []).map((x) => ({ id: x.id, name: x.name, issuedAt: iso(x.issuedAt)!, issuedBy: x.issuedBy, fileId: x.fileId ?? undefined })),
      messages: (msgsBy.get(r.ref) ?? []).map((m) => ({ id: String(m.id), at: iso(m.at)!, by: m.by, name: name(m.by), body: m.body })),
      notes: (notesBy.get(r.ref) ?? []).map((n) => ({ id: String(n.id), at: iso(n.at)!, by: n.by, name: name(n.by), body: n.body })),
      events: (evBy.get(r.ref) ?? []).map((e) => {
        const m = rowMsg(e.key, e.vars);
        const body = m && hasPart(m, "body") ? told(locale, m, "body", e.body ?? "") : legacyText(locale, e.body ?? undefined);
        return { at: iso(e.at)!, key: e.key ?? undefined, title: told(locale, m, "title", e.title), by: e.by ?? undefined, name: name(e.by), body };
      }),
    };
    const times = [req.events[0]?.at, req.messages[req.messages.length - 1]?.at, req.closed?.at, req.openedAt].filter(Boolean) as string[];
    return {
      ...req, service, account, agent: agentRow ? { id: agentRow.id, name: agentRow.name, role: agentRow.role, team: agentRow.team, title: agentRow.title, active: agentRow.active } : null,
      profile: toProfile(profile),
      name: req.title ?? service.name, flow: service.flow ?? [...STAGES], labels: service.stageLabels ?? {},
      updatedAt: times.sort((a, b) => Date.parse(b) - Date.parse(a))[0],
    };
  });
}

/** Drops everything a customer must never receive. */
function forCustomer(r: RequestView): CustomerRequest {
  const { notes: _notes, followUp: _followUp, handover: _handover, idReviewNote: _note, idReviewedBy: _by, ...rest } = r;
  return rest;
}
const byUpdated = (a: RequestView, b: RequestView) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

// ---------------- customer ----------------
export async function getAccount(): Promise<Account & { profiles: Profile[] }> {
  const id = await requireCustomerId();
  const d = await db();
  const [a] = await d.select().from(s.accounts).where(eq(s.accounts.id, id));
  const profiles = await d.select().from(s.profiles).where(eq(s.profiles.accountId, id));
  return {
    ...toAccount(a),
    profiles: profiles.map(toProfile),
  };
}
/** The language of the signed-in customer's portal and SMS.
 *  Deliberately not wrapped in React's cache(): with it, the page Next renders again after a server
 *  action was often never shown (a sent message or an upload stayed off the screen until a reload).
 *  It is one indexed lookup. */
export async function getPortalLocale(): Promise<Locale> {
  const id = await requireCustomerId();
  const [a] = await (await db()).select({ locale: s.accounts.locale }).from(s.accounts).where(eq(s.accounts.id, id));
  return a?.locale === "en" ? "en" : "rw";
}
/** The signed-in customer's requests: anything waiting on them first, then open, then finished. */
export async function listMyRequests(): Promise<CustomerRequest[]> {
  const id = await requireCustomerId();
  const profileIds = (await (await db()).select({ id: s.profiles.id }).from(s.profiles).where(eq(s.profiles.accountId, id))).map((p) => p.id);
  if (!profileIds.length) return [];
  const rank = (r: RequestView) => (r.hold && isOpen(r) ? 0 : isOpen(r) ? 1 : 2);
  return (await loadRequests(inArray(s.requests.profileId, profileIds), await getPortalLocale()))
    .sort((a, b) => rank(a) - rank(b) || Date.parse(b.openedAt) - Date.parse(a.openedAt)).map(forCustomer);
}
export async function getMyRequest(ref: string): Promise<CustomerRequest | undefined> {
  return (await listMyRequests()).find((r) => r.ref === ref);
}
/** The payment prompt still waiting on a request, for its payment screen. The caller has already checked that the
 *  request is the signed-in customer's (getMyRequest). The provider's reference is not returned. */
export async function getWaitingPayment(ref: string): Promise<{ txId: number; receipt: string; amount: number; payer: string | null } | null> {
  const [t] = await (await db()).select({ id: s.transactions.id, receipt: s.transactions.receipt, official: s.transactions.official, ours: s.transactions.ours, payer: s.transactions.payer })
    .from(s.transactions).where(and(eq(s.transactions.ref, ref), eq(s.transactions.status, "pending")));
  return t ? { txId: t.id, receipt: t.receipt, amount: t.official + t.ours, payer: t.payer } : null;
}
export async function listMyDocuments(): Promise<LibraryDoc[]> {
  const locale = await getPortalLocale();
  const t = (path: string, vars?: Record<string, string | number>) => text(locale, path, vars);
  const staffRows = await (await db()).select({ id: s.staff.id, name: s.staff.name }).from(s.staff);
  const reviewer = (id?: string) => { const n = staffRows.find((x) => x.id === id)?.name; return n ? shortName(n) : t("docs.yourAgent"); };
  const out: LibraryDoc[] = [];
  for (const r of await listMyRequests()) {
    if (r.closed) continue;
    for (const d of r.documents) {
      if (r.stage === "completed" && d.status === "approved") continue;
      const file = d.file ? `${d.file.name} · ${d.file.size}` : "";
      // A note is the agent's own words (why a copy was rejected), shown as typed.
      const meta =
        d.status === "rejected" ? (d.note ? t("docs.metaRejected", { ref: r.ref, note: d.note }) : t("docs.metaReplace", { ref: r.ref }))
        : d.status === "approved" ? t("docs.metaApproved", { file, name: reviewer(d.reviewedBy) })
        : d.status === "received" ? t("docs.metaReceived", { file })
        : d.note ? t("docs.metaNeededNote", { ref: r.ref, note: d.note }) : t("docs.metaNeeded", { ref: r.ref });
      out.push({ key: d.id, ref: r.ref, name: d.name, group: d.group, status: d.status, meta, action: d.status === "rejected" ? "replace" : d.status === "required" ? "upload" : undefined, fileId: d.file?.id });
    }
    for (const o of r.deliverables) out.push({ key: o.id, ref: r.ref, name: o.name, group: "Certificates", status: "issued", meta: t("docs.metaIssued", { who: channelName(o.issuedBy, locale), date: fmtDay(o.issuedAt, locale), ref: r.ref }), action: "download", fileId: o.fileId });
  }
  return out;
}
export async function listMyNotifications(): Promise<Notification[]> {
  const id = await requireCustomerId();
  const locale = await getPortalLocale();
  const rows = await (await db()).select().from(s.notifications).where(eq(s.notifications.accountId, id)).orderBy(desc(s.notifications.at)).limit(20);
  return rows.map((n) => ({ id: String(n.id), icon: n.icon, title: told(locale, rowMsg(n.key, n.vars), undefined, n.title), at: iso(n.at)!, unread: n.unread, href: n.href }));
}
export async function listMyReminders() {
  const id = await requireCustomerId();
  const locale = await getPortalLocale();
  const rows = await (await db()).select().from(s.reminders).where(and(eq(s.reminders.accountId, id), eq(s.reminders.dismissed, false)));
  return rows.map((m) => ({ ...m, title: legacyText(locale, m.title), body: legacyText(locale, m.body), cta: legacyText(locale, m.cta) }));
}

/** Public status check: needs the reference and the email or phone number on the request, and returns no personal data. */
export async function trackRequest(ref: string, contact: string): Promise<TrackResult | null> {
  const { getLocale } = await import("./i18n/locale");
  const { localizeService, requestTitle } = await import("./i18n/present");
  const key = ref.trim().toUpperCase().slice(0, 40);
  // Guessing the contact for one reference is limited per reference, whoever asks, so a spread of addresses gains nothing.
  if (!key || !(await allowFor("trackRef", key))) return null;
  // A cheap lookup first: most wrong references end here without loading a whole request.
  const [exists] = await (await db()).select({ ref: s.requests.ref }).from(s.requests).where(eq(s.requests.ref, key));
  if (!exists) return null;
  const locale = await getLocale();
  const [v] = await loadRequests(eq(s.requests.ref, key), locale);
  if (!v) return null;
  // An email is compared as an email, anything else as a phone number. Both are checked in constant time.
  const given = contact.trim();
  const want = given.includes("@") ? (v.account.email ?? "").toLowerCase() : phoneDigits(v.account.phone);
  const have = given.includes("@") ? given.toLowerCase() : phoneDigits(given);
  const a = Buffer.from(want), b = Buffer.from(have);
  if (!want || a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const local = localizeService(v.service, locale);
  return {
    ref: v.ref, name: requestTitle(v.name, v.service, locale), via: local.via, stage: v.stage, stageDates: v.stageDates, flow: v.flow, labels: v.labels, closed: v.closed, next: v.next,
    hold: v.hold && { reason: v.hold.reason, title: v.hold.title, since: v.hold.since, returned: v.hold.returned },
    idReview: v.idRequired ? v.idReview : undefined,
  };
}

// ---------------- staff ----------------
/** The signed-in member of staff. */
const plain = ({ permissions: _p, ...rest }: Staff & { permissions: Set<Permission> }): Staff => rest;
export const getStaffUser = async (next = "/console"): Promise<Staff> => plain(await requireStaff(next));
export const getAdmin = async (): Promise<Staff> => plain(await requireStaff("/admin"));
/** What the signed-in member of staff may do, for screens that enable or hide controls. */
export const getMyPermissions = async (): Promise<Permission[]> => [...(await requireStaff()).permissions];
/** Staff for the admin people list. Authenticator secrets and recovery hashes never leave the server: only whether the step is on. */
export async function listStaff(): Promise<(Staff & { phone: string | null; twoStep: boolean })[]> {
  const rows = await (await db()).select({ id: s.staff.id, name: s.staff.name, role: s.staff.role, team: s.staff.team, title: s.staff.title, active: s.staff.active, phone: s.staff.phone, enabledAt: s.staff.totpEnabledAt })
    .from(s.staff).orderBy(asc(s.staff.name));
  return rows.map(({ enabledAt, ...rest }) => ({ ...rest, twoStep: !!enabledAt }));
}
/** Active staff a case can be assigned to: everyone whose role works cases, owners and admins
 *  included, so a one-person team can take its own requests. Without their phone numbers. */
export async function listAgents(): Promise<Staff[]> {
  const rows = await (await db()).select({ staff: s.staff }).from(s.staff)
    .innerJoin(s.rolePermissions, and(eq(s.rolePermissions.role, s.staff.role), eq(s.rolePermissions.permission, WORKS_CASES), eq(s.rolePermissions.allowed, true)))
    .where(eq(s.staff.active, true)).orderBy(asc(s.staff.name));
  return rows.map(({ staff: p }) => ({ id: p.id, name: p.name, role: p.role, team: p.team, title: p.title, active: p.active }));
}

/** A request started at checkout and not paid yet is not work: it reaches staff queues once it is paid. */
const notUnpaidCheckout = ne(s.requests.checkout, "open");
/** New requests nobody has taken yet, for the triage inbox. */
const untaken = and(isNull(s.requests.agentId), eq(s.requests.stage, "received"), isNull(s.requests.closed), notUnpaidCheckout);

/** Badges in the staff navigation: new requests waiting for an agent, and my open cases. */
export async function getNavCounts(): Promise<{ inbox: number; mine: number; identity: number; tax: number }> {
  const me = await requireStaff();
  const d = await db();
  const count = { n: sql<number>`count(*)::int` };
  const pendingReview = and(eq(s.requests.idRequired, true), eq(s.requests.idReview, "pending"), isNull(s.requests.closed), ne(s.requests.stage, "completed"), notUnpaidCheckout, caseScope(me));
  const [[inbox], [mine], [identity]] = await Promise.all([
    canTriage(me) ? d.select(count).from(s.requests).where(untaken) : Promise.resolve([{ n: 0 }]),
    d.select(count).from(s.requests).where(and(eq(s.requests.agentId, me.id), isNull(s.requests.closed), ne(s.requests.stage, "completed"))),
    me.permissions.has("reviewDocs") ? d.select(count).from(s.requests).where(pendingReview) : Promise.resolve([{ n: 0 }]),
  ]);
  const { countTaxAttention } = await import("./tax-diary");
  const tax = seesAllCases(me) ? await countTaxAttention().catch(() => 0) : 0;
  return { inbox: inbox.n, mine: mine.n, identity: identity.n, tax };
}

/** ID reviews this person may see. The number itself stays masked; revealing it is a separate audited action. */
export async function listIdentityReviews(): Promise<{
  ref: string; name: string; serviceSlug: string; serviceName: string; openedAt: string; stage: Stage;
  idReview: IdReview | null; idMasked?: string; profileName: string; agentName: string | null; closed: boolean;
}[]> {
  const me = await requireStaff("/console/identity");
  if (!me.permissions.has("reviewDocs")) return [];
  const rows = await loadRequests(and(eq(s.requests.idRequired, true), notUnpaidCheckout, caseScope(me)));
  return rows.sort(byUpdated).map((r) => ({
    ref: r.ref, name: r.name, serviceSlug: r.serviceSlug, serviceName: r.service.name, openedAt: r.openedAt, stage: r.stage,
    idReview: r.idReview ?? null, idMasked: r.profile.idMasked, profileName: r.profile.name, agentName: r.agent?.name ?? null, closed: !!r.closed,
  }));
}

export async function listInbox(): Promise<RequestView[]> {
  const me = await requireStaff("/console/inbox");
  return canTriage(me) ? (await loadRequests(untaken)).sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt)) : [];
}

/** Requests started at checkout and not paid yet, newest first: people to follow up, not work to do. */
export async function listOpenCheckouts(): Promise<RequestView[]> {
  const me = await requireStaff("/console/inbox");
  if (!canTriage(me)) return [];
  return (await loadRequests(and(eq(s.requests.checkout, "open"), isNull(s.requests.closed)))).sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
}

/** Cases this person may see: everything with "View all cases", otherwise their own. Unpaid checkouts are left out. */
export async function listCases(): Promise<RequestView[]> {
  const me = await requireStaff("/console/requests");
  return (await loadRequests(and(caseScope(me), notUnpaidCheckout))).sort(byUpdated);
}

export async function getRequest(ref: string): Promise<RequestView | undefined> {
  const me = await requireStaff(`/console/requests/${ref}`);
  const [v] = await loadRequests(eq(s.requests.ref, ref));
  return v && canSeeCase(me, v) ? v : undefined;
}

const thousands = (n: number) => Math.round(n / 100) / 10;
export const rwfShort = (n: number) => (n >= 1e6 ? `RWF ${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M` : n >= 1e4 ? `RWF ${Math.round(n / 1e3)}k` : `RWF ${n.toLocaleString("en-US")}`);

// ---------------- console: clients ----------------
type AccountRow = typeof s.accounts.$inferSelect;

/** One directory row, worked out from the requests the viewer may see. */
function clientSummary(p: ProfileRow, acc: AccountRow | undefined, tags: string[], pReqs: RequestView[]): ClientSummary {
  let totalPaidOurs = 0;
  let totalPaidOfficial = 0;
  let balanceDue = 0;
  for (const r of pReqs) {
    for (const t of r.billing.transactions) {
      if (t.status === "paid") {
        totalPaidOurs += t.ours;
        totalPaidOfficial += t.official;
      }
    }
    if (isOpen(r)) balanceDue += amountDue(r.billing);
  }
  const since = acc ? iso(acc.since)! : new Date().toISOString();
  const lastActivity = pReqs.map((r) => r.updatedAt).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? since;
  return {
    id: p.id,
    accountId: p.accountId,
    name: p.name,
    kind: p.kind,
    phone: acc ? prettyPhone(acc.phone) : "",
    district: p.district ?? undefined,
    idMasked: p.idMasked ?? undefined,
    tinMasked: p.tinMasked ?? undefined,
    openRequests: pReqs.filter(isOpen).length,
    totalRequests: pReqs.length,
    totalPaidOurs,
    totalPaidOfficial,
    balanceDue,
    lastActivity,
    tags,
    since,
  };
}

/** Clients this person may see: everyone with "View all cases", otherwise the clients of their own cases. */
export async function listClients(): Promise<ClientSummary[]> {
  const me = await requireStaff("/console/clients");
  const all = seesAllCases(me);
  const d = await db();
  const requests = await loadRequests(caseScope(me));
  const ids = [...new Set(requests.map((r) => r.profileId))];
  if (!all && !ids.length) return [];
  const [profs, tagsRows] = await Promise.all([
    d.select().from(s.profiles).where(all ? undefined : inArray(s.profiles.id, ids)),
    d.select().from(s.clientTags).where(all ? undefined : inArray(s.clientTags.profileId, ids)),
  ]);
  if (!profs.length) return [];
  const accs = await d.select().from(s.accounts).where(inArray(s.accounts.id, [...new Set(profs.map((p) => p.accountId))]));

  const accMap = new Map(accs.map((a) => [a.id, a]));
  const tagsByProfile = new Map<string, string[]>();
  for (const t of tagsRows) tagsByProfile.set(t.profileId, [...(tagsByProfile.get(t.profileId) ?? []), t.tag]);
  const reqsByProfile = new Map<string, RequestView[]>();
  for (const r of requests) reqsByProfile.set(r.profileId, [...(reqsByProfile.get(r.profileId) ?? []), r]);

  return profs.map((p) => clientSummary(p, accMap.get(p.accountId), tagsByProfile.get(p.id) ?? [], reqsByProfile.get(p.id) ?? []));
}

/** One client's file. Without "View all cases", only clients of their own cases, and only those cases. */
export async function getClient(profileId: string): Promise<ClientDetail | undefined> {
  const me = await requireStaff(`/console/clients/${profileId}`);
  const d = await db();
  const [profRow] = await d.select().from(s.profiles).where(eq(s.profiles.id, profileId));
  if (!profRow) return undefined;

  const requests = await loadRequests(and(eq(s.requests.profileId, profileId), caseScope(me)));
  if (!seesAllCases(me) && !requests.length) return undefined;

  const [[accRow], tagRows, clientNotesRows, staffRows] = await Promise.all([
    d.select().from(s.accounts).where(eq(s.accounts.id, profRow.accountId)),
    d.select().from(s.clientTags).where(eq(s.clientTags.profileId, profileId)),
    d.select().from(s.clientNotes).where(eq(s.clientNotes.profileId, profileId)).orderBy(desc(s.clientNotes.at)),
    d.select().from(s.staff),
  ]);
  if (!accRow) return undefined;
  const summary = clientSummary(profRow, accRow, tagRows.map((t) => t.tag), requests);

  const account: Account = toAccount(accRow);
  const profile = toProfile(profRow);

  const documents: LibraryDoc[] = [];
  const messages: Message[] = [];
  const events: RequestEvent[] = [];
  const notes: Note[] = [];

  for (const n of clientNotesRows) {
    const staffMember = staffRows.find((st) => st.id === n.by);
    notes.push({
      id: String(n.id),
      at: iso(n.at)!,
      by: n.by,
      name: staffMember?.name ?? "Staff",
      body: n.body,
    });
  }

  for (const r of requests) {
    for (const d of r.documents) {
      documents.push({
        key: d.id,
        ref: r.ref,
        name: d.name,
        group: d.group,
        status: d.status,
        meta: `For ${r.ref} · ${d.status}`,
        fileId: d.file?.id,
      });
    }
    for (const o of r.deliverables) {
      documents.push({
        key: o.id,
        ref: r.ref,
        name: o.name,
        group: "Certificates",
        status: "issued",
        meta: `Delivered for ${r.ref}`,
        fileId: o.fileId,
      });
    }
    messages.push(...r.messages);
    events.push(...r.events);
    notes.push(...r.notes);
  }

  messages.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  notes.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return {
    ...summary,
    account,
    profile,
    requests,
    documents,
    messages,
    notes,
    events,
  };
}

// ---------------- console: saved views & targets ----------------
/** The shared views, plus the ones this person saved. */
export async function listSavedViews(entity: "requests" | "clients"): Promise<SavedView[]> {
  const me = await requireStaff();
  const d = await db();
  const rows = await d.select().from(s.savedViews)
    .where(and(eq(s.savedViews.entity, entity), or(isNull(s.savedViews.staffId), eq(s.savedViews.staffId, me.id))))
    .orderBy(asc(s.savedViews.createdAt));
  return rows.map((r) => ({
    id: r.id,
    entity: r.entity,
    name: r.name,
    filters: r.filters,
    columns: r.columns ?? undefined,
    sort: r.sort ?? undefined,
    isDefault: r.isDefault,
    staffId: r.staffId,
  }));
}

export async function listStageTargets(): Promise<Record<Stage, number>> {
  const d = await db();
  const rows = await d.select().from(s.stageTargets);
  const defaults: Record<Stage, number> = { received: 2, checking: 4, preparing: 24, institution: 72, completed: 0 };
  for (const r of rows) {
    defaults[r.stage] = r.targetHours;
  }
  return defaults;
}

// ---------------- console: global search ----------------
export async function searchGlobal(q: string) {
  const term = q.trim().toLowerCase();
  if (!term) return { requests: [], clients: [], services: [] };

  const me = await requireStaff();
  const [cases, clients, services] = await Promise.all([
    loadRequests(caseScope(me)),
    listClients(),
    listServices({ includeHidden: true }),
  ]);

  const matchingRequests = cases.filter((c) =>
    c.ref.toLowerCase().includes(term) ||
    (c.officialRef && c.officialRef.toLowerCase().includes(term)) ||
    c.name.toLowerCase().includes(term) ||
    c.profile.name.toLowerCase().includes(term)
  ).slice(0, 8);

  const matchingClients = clients.filter((cl) =>
    cl.name.toLowerCase().includes(term) ||
    cl.phone.replace(/\s+/g, "").includes(term.replace(/\s+/g, "")) ||
    (cl.district && cl.district.toLowerCase().includes(term))
  ).slice(0, 8);

  const matchingServices = services.filter((sv) =>
    sv.name.toLowerCase().includes(term) ||
    (sv.aka && sv.aka.toLowerCase().includes(term)) ||
    sv.summary.toLowerCase().includes(term)
  ).slice(0, 8);

  return {
    requests: matchingRequests.map((r) => ({ ref: r.ref, name: r.name, client: r.profile.name, stage: r.stage })),
    clients: matchingClients.map((c) => ({ id: c.id, name: c.name, phone: c.phone, kind: c.kind })),
    services: matchingServices.map((s) => ({ slug: s.slug, name: s.name, category: s.category })),
  };
}

// ---------------- console: agent my day ----------------
export async function getMyDayData(agentId?: string) {
  const me = agentId ? { id: agentId } : await requireStaff();
  const [cases, targets, now] = await Promise.all([loadRequests(eq(s.requests.agentId, me.id)), listStageTargets(), getNow()]);
  const open = cases.filter(isOpen);
  const oldestFirst = <T,>(list: T[], at: (x: T) => string) => [...list].sort((a, b) => Date.parse(at(a)) - Date.parse(at(b)));

  return {
    // Due today, or missed on an earlier day and still not done.
    todayFollowUps: oldestFirst(open.filter((c) => c.followUp && isOnOrBeforeDay(c.followUp.at, now)), (c) => c.followUp!.at),
    // At 75% of the stage target or over it, unless the case is waiting on the customer.
    slaCases: open.filter((c) => !c.hold).flatMap((c) => {
      const k = stageClock(c, targets, now);
      return k?.near ? [{ case: c, hoursElapsed: k.hoursElapsed, targetHours: k.targetHours, breached: k.breached }] : [];
    }),
    clientReplies: oldestFirst(open.filter((c) => c.messages[c.messages.length - 1]?.by === "customer"), (c) => c.messages[c.messages.length - 1].at),
    pendingDocs: oldestFirst(open.flatMap((c) => c.documents.filter((d) => d.status === "received").map((d) => ({ case: c, doc: d }))), (x) => x.doc.file?.uploadedAt ?? x.case.updatedAt),
    openCasesCount: open.length,
  };
}

// ---------------- admin / overview ----------------
export const OVERVIEW_RANGES = [7, 30, 90] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];

/** Everything the operations overview shows, from one load of the cases. Needs "View all cases". */
export async function getAdminOverview(rangeDays: OverviewRange = 30) {
  const me = await requireStaff();
  if (!seesAllCases(me)) throw new Error("The overview needs “View all cases”.");
  const d = await db();
  const now = await getNow();
  const nowMs = Date.parse(now);
  const since = nowMs - rangeDays * DAY;
  const prevSince = since - rangeDays * DAY;
  const inRange = (at: string | undefined) => !!at && Date.parse(at) >= since;
  const inPrev = (at: string | undefined) => !!at && Date.parse(at) >= prevSince && Date.parse(at) < since;

  const [everything, accountRows, txRows, cats, services, targets, workers] = await Promise.all([
    loadRequests(),
    d.select({ since: s.accounts.since }).from(s.accounts),
    d.select().from(s.transactions),
    listCategories(),
    listServices({ includeHidden: true }),
    listStageTargets(),
    listAgents(),
  ]);
  const txs = txRows.map((x) => ({ ...x, at: iso(x.at)! }));
  // Unpaid checkouts are not cases yet; they are counted only in the checkout figures.
  const cases = everything.filter((r) => r.checkout !== "open");
  const open = cases.filter(isOpen);
  const checkoutsInRange = everything.filter((r) => r.checkout && inRange(r.openedAt));
  const checkoutsPaid = checkoutsInRange.filter((r) => r.checkout === "paid").length;
  const checkoutsWaiting = everything.filter((r) => r.checkout === "open" && !r.closed);

  const paidInRange = txs.filter((x) => x.status === "paid" && inRange(x.at));
  const paidPrevRange = txs.filter((x) => x.status === "paid" && inPrev(x.at));
  const refundedInRange = txs.filter((x) => x.status === "refunded" && inRange(x.at));
  const ours = paidInRange.reduce((n, x) => n + x.ours, 0);
  const prevOurs = paidPrevRange.reduce((n, x) => n + x.ours, 0);
  const official = paidInRange.reduce((n, x) => n + x.official, 0);
  const methods = new Map<string, number>();
  for (const x of paidInRange) methods.set(x.method, (methods.get(x.method) ?? 0) + x.ours + x.official);

  const openedInRange = cases.filter((r) => inRange(r.openedAt));
  const openedPrevRange = cases.filter((r) => inPrev(r.openedAt));
  const completedInRange = cases.filter((r) => r.stage === "completed" && inRange(r.stageDates.completed));
  const completedPrevRange = cases.filter((r) => r.stage === "completed" && inPrev(r.stageDates.completed));
  const days = (r: RequestView) => (Date.parse(r.stageDates.completed!) - Date.parse(r.openedAt)) / DAY;
  const onTime = completedInRange.filter((r) => days(r) * 24 <= caseTargetHours(r, targets)).length;

  const pending = open.filter((r) => r.billing.quote !== "estimate" && amountDue(r.billing) > 0);
  const totalBalanceDue = pending.reduce((n, r) => n + amountDue(r.billing), 0);

  // A percentage only means something against a baseline of five or more.
  const deltaStr = (current: number, previous: number) => {
    const diff = current - previous;
    const sign = diff >= 0 ? "+" : "";
    return previous >= 5 ? `${sign}${diff} (${sign}${Math.round((diff / previous) * 100)}%) vs prev ${rangeDays}d` : `${sign}${diff} vs prev ${rangeDays}d`;
  };
  const revenueDelta = prevOurs >= 50000
    ? `${ours >= prevOurs ? "+" : ""}${rwfShort(ours - prevOurs)} (${ours >= prevOurs ? "+" : ""}${Math.round(((ours - prevOurs) / prevOurs) * 100)}%) vs prev ${rangeDays}d`
    : "";

  // The last six Kigali calendar months, oldest first.
  const months = Array.from({ length: 6 }, (_, i) => {
    const start = kigaliMonthStart(now, i - 5), end = kigaliMonthStart(now, i - 4);
    const inMonth = txs.filter((x) => x.status === "paid" && Date.parse(x.at) >= start && Date.parse(x.at) < end);
    return { label: monthShort(start), official: thousands(inMonth.reduce((n, x) => n + x.official, 0)), ours: thousands(inMonth.reduce((n, x) => n + x.ours, 0)) };
  });

  const popularMap = new Map<string, { n: number; cat: string }>();
  for (const r of openedInRange) popularMap.set(r.service.name, { n: (popularMap.get(r.service.name)?.n ?? 0) + 1, cat: cats.find((c) => c.id === r.service.category)?.short ?? "" });
  const sources = new Map<string, number>();
  for (const r of openedInRange) sources.set(sourceOf(r), (sources.get(sourceOf(r)) ?? 0) + 1);

  const pipeline = STAGES.filter((st) => st !== "completed").map((stage) => {
    const here = open.filter((r) => r.stage === stage);
    const oldest = here.map((r) => ({ ref: r.ref, since: r.stageDates[stage] ?? r.openedAt })).sort((a, b) => Date.parse(a.since) - Date.parse(b.since))[0] ?? null;
    return { stage, label: STAGE_LABEL[stage], count: here.length, late: here.filter((r) => isLate(r, targets, now)).length, onHold: here.filter((r) => r.hold).length, targetHours: targets[stage], oldest };
  });

  const team = workers.map((p) => {
    const mine = cases.filter((r) => r.agentId === p.id);
    const done = completedInRange.filter((r) => r.agentId === p.id);
    const turnaround = median(done.map(days));
    return {
      id: p.id, name: p.name, team: p.team, role: p.role,
      active: mine.filter(isOpen).length,
      late: mine.filter((r) => isLate(r, targets, now)).length,
      completed: done.length,
      turnaround: turnaround === null ? "—" : `${turnaround.toFixed(1)} days`,
      firstTime: done.length ? `${Math.round((done.filter((r) => !wasReturned(r)).length / done.length) * 100)}%` : "—",
    };
  });
  const turnaround = median(completedInRange.map(days));

  return {
    now,
    period: `Last ${rangeDays} days`,
    rangeDays,
    needsAttention: attentionCounts(cases, services, targets, now),
    queue: workQueue(cases, targets, now),
    customers: { value: accountRows.length.toLocaleString("en-US"), delta: `+${accountRows.filter((a) => Date.parse(iso(a.since)!) >= kigaliMonthStart(now)).length} this month` },
    activeCases: { value: open.length, needCustomer: open.filter((r) => r.hold).length },
    opened: { value: openedInRange.length, delta: deltaStr(openedInRange.length, openedPrevRange.length) },
    completed: { value: completedInRange.length, delta: deltaStr(completedInRange.length, completedPrevRange.length) },
    onTime: { pct: completedInRange.length ? Math.round((onTime / completedInRange.length) * 100) : null, of: completedInRange.length, medianDays: turnaround === null ? null : Number(turnaround.toFixed(1)) },
    checkout: {
      started: checkoutsInRange.length, paid: checkoutsPaid,
      rate: checkoutsInRange.length ? Math.round((checkoutsPaid / checkoutsInRange.length) * 100) : null,
      waiting: checkoutsWaiting.length, waitingValue: rwfShort(checkoutsWaiting.reduce((n, r) => n + payableNow(r.billing, true).amount, 0)),
    },
    pending: { value: rwfShort(totalBalanceDue), rawAmount: totalBalanceDue, invoices: pending.length, overdue: pending.filter((r) => payStatus(r.billing, now) === "overdue").length },
    revenue: {
      ours: rwfShort(ours), rawOurs: ours, delta: revenueDelta,
      official: rwfShort(official), rawOfficial: official,
      gross: rwfShort(ours + official),
      refunds: rwfShort(refundedInRange.reduce((n, x) => n + x.ours + x.official, 0)), refundCount: refundedInRange.length,
      methods: [...methods.entries()].sort((a, b) => b[1] - a[1]),
    },
    monthly: months,
    pipeline,
    byCategory: cats.filter((c) => !c.href).map((c) => [c.name, open.filter((r) => r.service.category === c.id).length] as [string, number]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]),
    popular: [...popularMap.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([n, v]) => [n, v.n, v.cat] as [string, number, string]),
    sources: [...sources.entries()].sort((a, b) => b[1] - a[1]),
    team,
    recentActivity: cases.flatMap((c) => c.events.map((e) => ({ at: e.at, title: e.title, name: e.name, ref: c.ref, client: c.profile.name }))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 8),
  };
}
export type AdminOverview = Awaited<ReturnType<typeof getAdminOverview>>;

export async function listAudit(): Promise<AuditEntry[]> {
  const rows = await (await db()).select().from(s.audit).orderBy(desc(s.audit.at), desc(s.audit.id)).limit(200);
  return rows.map((a) => ({ at: iso(a.at)!, actor: a.actor, role: a.role, action: a.action, entity: a.entity, source: a.source, fee: a.fee }));
}

export async function listRoles() {
  const people = await listStaff();
  return ROLES.map((r) => ({ ...r, count: people.filter((p) => p.role === r.name && p.active).length }));
}

/** The roles matrix: for each permission, whether each role (in the order of ROLES) has it. */
export async function getPermissionMatrix() {
  const rows = await (await db()).select().from(s.rolePermissions);
  const matrix = Object.fromEntries((Object.keys(PERMISSIONS) as Permission[]).map((p) => [p, ROLES.map((r) => rows.find((x) => x.role === r.name && x.permission === p)?.allowed ?? false)])) as Record<Permission, boolean[]>;
  return { groups: PERMISSION_GROUPS.map((g) => ({ group: g.group, items: g.items.map((p) => ({ key: p, name: PERMISSIONS[p] })) })), matrix };
}

/** Who is signed in, for pages that adapt to it (e.g. the public nav). */
export async function whoIsSignedIn() {
  const session = await getSession();
  return session?.kind ?? null;
}
