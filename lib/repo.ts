// The data-access layer: every screen reads through these functions, and only they touch the
// database. Writes live in app/actions. Only import this from server code.
import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { canSeeCase, canTriage, caseScope, seesAllCases } from "./access";
import { getSession, requireCustomerId, requireStaff } from "./auth";
import { db, iso, schema as s } from "./db";
import { fmtDay, phoneDigits, shortName } from "./format";
import { PERMISSION_GROUPS, PERMISSIONS, ROLES, type Permission } from "./permissions";
import { amountDue, isOpen, payStatus } from "./status";
import { STAGES, type Account, type AuditEntry, type Category, type ClientDetail, type ClientSummary, type CustomerRequest, type LibraryDoc, type Message, type Note, type Notification, type Profile, type Request, type RequestEvent, type RequestView, type SavedView, type Service, type Staff, type Stage, type StageTarget, type TrackResult } from "./types";

export const getNow = async () => new Date().toISOString();
const DAY = 864e5;

// ---------------- catalogue ----------------
type ServiceRow = typeof s.services.$inferSelect;
export const toService = (r: ServiceRow): Service => ({
  slug: r.slug, name: r.name, aka: r.aka ?? undefined, category: r.category, authority: r.authority, channel: r.channel, via: r.via, summary: r.summary,
  who: r.who, requirements: r.requirements, documents: r.documents, steps: r.steps, notes: r.notes,
  official: { amount: r.officialAmount, mode: r.officialMode ?? undefined, label: r.officialLabel ?? undefined, note: r.officialNote, verifiedAt: iso(r.officialVerifiedAt) },
  ours: r.ours, oursUnit: r.oursUnit ?? undefined, time: r.time, docsShort: r.docsShort, popular: r.popular, audience: r.audience,
  purposes: r.purposes ?? undefined, purposeLabel: r.purposeLabel ?? undefined, noId: r.noId, flow: r.flow ?? undefined, stageLabels: r.stageLabels ?? undefined, visible: r.visible,
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

// ---------------- loading requests ----------------
type ProfileRow = typeof s.profiles.$inferSelect;
/** A profile as screens receive it: the national ID and TIN only in their masked form. */
const toProfile = (p: ProfileRow): Profile => ({
  id: p.id, accountId: p.accountId, kind: p.kind, name: p.name, relation: p.relation ?? undefined,
  idMasked: p.idMasked ?? undefined, tinMasked: p.tinMasked ?? undefined, district: p.district ?? undefined,
});

/** Loads requests with everything they point to, in a handful of queries. */
async function loadRequests(where?: SQL): Promise<RequestView[]> {
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
    const account: Account = { ...accountRow, phone: `+250 ${accountRow.phone.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")}`, since: iso(accountRow.since)! };
    const service = toService(svcs.find((x) => x.slug === r.serviceSlug)!);
    const agentRow = staffRows.find((x) => x.id === r.agentId);
    const name = (who?: string | null) => (who === "customer" ? account.name : !who || who === "system" ? "System" : staffRows.find((x) => x.id === who)?.name ?? "Inzira");
    const req: Request = {
      ref: r.ref, serviceSlug: r.serviceSlug, title: r.title ?? undefined, profileId: r.profileId, agentId: r.agentId, openedAt: iso(r.openedAt)!,
      stage: r.stage, stageDates: r.stageDates, hold: r.hold ?? undefined, closed: r.closed ?? undefined, channel: r.channel,
      officialRef: r.officialRef ?? undefined, dependsOn: r.dependsOn ?? undefined, purpose: r.purpose ?? undefined, summary: r.summary, next: r.next, followUp: r.followUp ?? undefined,
      billing: {
        invoice: r.invoice, official: r.official, officialMode: r.officialMode ?? undefined, officialLabel: r.officialLabel, ours: r.ours, oursStandard: r.oursStandard,
        oursUnit: r.oursUnit ?? undefined, oursNote: r.oursNote ?? undefined, quote: r.quote, dueAt: iso(r.dueAt), officialReceipt: r.officialReceipt,
        transactions: (txBy.get(r.ref) ?? []).map((t) => ({ receipt: t.receipt, at: iso(t.at)!, method: t.method, official: t.official, ours: t.ours, status: t.status })),
      },
      documents: (docsBy.get(r.ref) ?? []).map((x) => ({
        id: x.id, name: x.name, group: x.group, required: x.required, status: x.status, note: x.note ?? undefined, reviewedAt: iso(x.reviewedAt), reviewedBy: x.reviewedBy ?? undefined,
        file: x.fileName ? { name: x.fileName, size: x.fileSize ?? "", uploadedAt: iso(x.uploadedAt)!, id: x.fileId ?? undefined } : undefined,
      })),
      deliverables: (outsBy.get(r.ref) ?? []).map((x) => ({ id: x.id, name: x.name, issuedAt: iso(x.issuedAt)!, issuedBy: x.issuedBy, fileId: x.fileId ?? undefined })),
      messages: (msgsBy.get(r.ref) ?? []).map((m) => ({ id: String(m.id), at: iso(m.at)!, by: m.by, name: name(m.by), body: m.body })),
      notes: (notesBy.get(r.ref) ?? []).map((n) => ({ id: String(n.id), at: iso(n.at)!, by: n.by, name: name(n.by), body: n.body })),
      events: (evBy.get(r.ref) ?? []).map((e) => ({ at: iso(e.at)!, title: e.title, by: e.by ?? undefined, name: name(e.by), body: e.body ?? undefined })),
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
  const { notes: _notes, followUp: _followUp, ...rest } = r;
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
    ...a, phone: `+250 ${a.phone.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")}`, since: iso(a.since)!,
    profiles: profiles.map(toProfile),
  };
}
/** The signed-in customer's requests: anything waiting on them first, then open, then finished. */
export async function listMyRequests(): Promise<CustomerRequest[]> {
  const id = await requireCustomerId();
  const profileIds = (await (await db()).select({ id: s.profiles.id }).from(s.profiles).where(eq(s.profiles.accountId, id))).map((p) => p.id);
  if (!profileIds.length) return [];
  const rank = (r: RequestView) => (r.hold && isOpen(r) ? 0 : isOpen(r) ? 1 : 2);
  return (await loadRequests(inArray(s.requests.profileId, profileIds)))
    .sort((a, b) => rank(a) - rank(b) || Date.parse(b.openedAt) - Date.parse(a.openedAt)).map(forCustomer);
}
export async function getMyRequest(ref: string): Promise<CustomerRequest | undefined> {
  return (await listMyRequests()).find((r) => r.ref === ref);
}
export async function listMyDocuments(): Promise<LibraryDoc[]> {
  const staffRows = await (await db()).select({ id: s.staff.id, name: s.staff.name }).from(s.staff);
  const reviewer = (id?: string) => shortName(staffRows.find((x) => x.id === id)?.name ?? "your agent");
  const out: LibraryDoc[] = [];
  for (const r of await listMyRequests()) {
    if (r.closed) continue;
    for (const d of r.documents) {
      if (r.stage === "completed" && d.status === "approved") continue;
      const file = d.file ? `${d.file.name} · ${d.file.size}` : "";
      const meta =
        d.status === "rejected" ? `For ${r.ref} · ${d.note ?? "needs replacing"}`
        : d.status === "approved" ? `${file} · approved by ${reviewer(d.reviewedBy)}`
        : d.status === "received" ? `${file} · awaiting review`
        : `Needed for ${r.ref}${d.note ? ` · ${d.note}` : ""}`;
      out.push({ key: d.id, ref: r.ref, name: d.name, group: d.group, status: d.status, meta, action: d.status === "rejected" ? "replace" : d.status === "required" ? "upload" : undefined, fileId: d.file?.id });
    }
    for (const o of r.deliverables) out.push({ key: o.id, ref: r.ref, name: o.name, group: "Certificates", status: "issued", meta: `Issued by ${o.issuedBy} · ${fmtDay(o.issuedAt)} · ${r.ref}`, action: "download", fileId: o.fileId });
  }
  return out;
}
export async function listMyNotifications(): Promise<Notification[]> {
  const id = await requireCustomerId();
  const rows = await (await db()).select().from(s.notifications).where(eq(s.notifications.accountId, id)).orderBy(desc(s.notifications.at)).limit(20);
  return rows.map((n) => ({ id: String(n.id), icon: n.icon, title: n.title, at: iso(n.at)!, unread: n.unread, href: n.href }));
}
export async function listMyReminders() {
  const id = await requireCustomerId();
  return (await db()).select().from(s.reminders).where(and(eq(s.reminders.accountId, id), eq(s.reminders.dismissed, false)));
}

/** Public status check: needs the reference and the phone number on the request, and returns no personal data. */
export async function trackRequest(ref: string, phone: string): Promise<TrackResult | null> {
  const [v] = await loadRequests(eq(s.requests.ref, ref.trim().toUpperCase()));
  if (!v || phoneDigits(v.account.phone) !== phoneDigits(phone)) return null;
  const { getLocale } = await import("./i18n/locale");
  const { localizeService, requestTitle } = await import("./i18n/present");
  const locale = await getLocale();
  const local = localizeService(v.service, locale);
  return {
    ref: v.ref, name: requestTitle(v.name, v.service, locale), via: local.via, stage: v.stage, stageDates: v.stageDates, flow: v.flow, labels: v.labels, closed: v.closed, next: v.next,
    hold: v.hold && { reason: v.hold.reason, title: v.hold.title, since: v.hold.since, returned: v.hold.returned },
  };
}

// ---------------- staff ----------------
/** The signed-in member of staff. */
const plain = ({ permissions: _p, ...rest }: Staff & { permissions: Set<Permission> }): Staff => rest;
export const getStaffUser = async (next = "/console"): Promise<Staff> => plain(await requireStaff(next));
export const getAdmin = async (): Promise<Staff> => plain(await requireStaff("/admin"));
/** What the signed-in member of staff may do, for screens that enable or hide controls. */
export const getMyPermissions = async (): Promise<Permission[]> => [...(await requireStaff()).permissions];
export async function listStaff(): Promise<(Staff & { phone: string | null })[]> {
  return (await db()).select().from(s.staff).orderBy(asc(s.staff.name));
}
/** Active agents a case can be assigned to, without their phone numbers. */
export async function listAgents(): Promise<Staff[]> {
  const rows = await (await db()).select().from(s.staff).where(and(eq(s.staff.role, "Agent"), eq(s.staff.active, true))).orderBy(asc(s.staff.name));
  return rows.map(({ phone: _phone, ...rest }) => rest);
}

/** New requests nobody has taken yet, for the triage inbox. */
const untaken = and(isNull(s.requests.agentId), eq(s.requests.stage, "received"), isNull(s.requests.closed));

/** Badges in the staff navigation: new requests waiting for an agent, and my open cases. */
export async function getNavCounts(): Promise<{ inbox: number; mine: number }> {
  const me = await requireStaff();
  const d = await db();
  const count = { n: sql<number>`count(*)::int` };
  const [[inbox], [mine]] = await Promise.all([
    canTriage(me) ? d.select(count).from(s.requests).where(untaken) : Promise.resolve([{ n: 0 }]),
    d.select(count).from(s.requests).where(and(eq(s.requests.agentId, me.id), isNull(s.requests.closed), ne(s.requests.stage, "completed"))),
  ]);
  return { inbox: inbox.n, mine: mine.n };
}

export async function listInbox(): Promise<RequestView[]> {
  const me = await requireStaff("/console/inbox");
  return canTriage(me) ? (await loadRequests(untaken)).sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt)) : [];
}

/** Cases this person may see: everything with "View all cases", otherwise their own. */
export async function listCases(): Promise<RequestView[]> {
  const me = await requireStaff("/console/requests");
  return (await loadRequests(caseScope(me))).sort(byUpdated);
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
    phone: acc ? `+250 ${acc.phone.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")}` : "",
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

  const account: Account = {
    ...accRow,
    phone: `+250 ${accRow.phone.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")}`,
    since: iso(accRow.since)!,
  };
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

// ---------------- console: needs attention ----------------
export async function getNeedsAttentionCounts() {
  const now = new Date().toISOString();
  const [cases, services, targets] = await Promise.all([
    loadRequests(),
    listServices({ includeHidden: true }),
    listStageTargets(),
  ]);

  const open = cases.filter(isOpen);

  // 1. New submissions to assign
  const unassigned = open.filter((r) => r.stage === "received" && !r.agentId);

  // 2. Overdue payments
  const overdue = open.filter((r) => payStatus(r.billing, now) === "overdue");

  // 3. Past target time (SLA)
  const slaBreached = open.filter((r) => {
    const stageEntered = r.stageDates[r.stage];
    if (!stageEntered) return false;
    const targetHours = targets[r.stage] ?? 24;
    if (targetHours <= 0) return false;
    const hoursElapsed = (Date.now() - Date.parse(stageEntered)) / (3600 * 1000);
    return hoursElapsed > targetHours;
  });

  // 4. Waiting on client > 3 days
  const waiting3d = open.filter((r) => {
    if (!r.hold) return false;
    const days = (Date.now() - Date.parse(r.hold.since)) / DAY;
    return days >= 3;
  });

  // 5. Official fees not checked
  const uncheckedOfficial = services.filter((s) => !s.official.mode && !s.official.verifiedAt);

  // 6. Official receipts missing
  const missingReceipts = open.filter((r) =>
    !r.billing.officialMode &&
    r.billing.officialReceipt !== "attached" &&
    (r.stage === "preparing" || r.stage === "institution" || r.stage === "completed")
  );

  return {
    unassigned: unassigned.length,
    overdue: overdue.length,
    slaBreached: slaBreached.length,
    waiting3d: waiting3d.length,
    uncheckedOfficial: uncheckedOfficial.length,
    missingReceipts: missingReceipts.length,
  };
}

// ---------------- console: agent my day ----------------
export async function getMyDayData(agentId?: string) {
  const me = agentId ? { id: agentId } : await requireStaff();
  const now = new Date().toISOString();
  const [cases, targets] = await Promise.all([
    loadRequests(eq(s.requests.agentId, me.id)),
    listStageTargets(),
  ]);

  const open = cases.filter(isOpen);

  // 1. Follow-ups due today
  const todayFollowUps = open.filter((c) => {
    if (!c.followUp) return false;
    const fuDate = new Date(c.followUp.at).toDateString();
    const todayDate = new Date().toDateString();
    return fuDate === todayDate;
  });

  // 2. Cases near or past SLA target
  const slaCases = open.filter((c) => {
    const stageEntered = c.stageDates[c.stage];
    if (!stageEntered) return false;
    const targetHours = targets[c.stage] ?? 24;
    if (targetHours <= 0) return false;
    const hoursElapsed = (Date.now() - Date.parse(stageEntered)) / (3600 * 1000);
    return hoursElapsed >= targetHours * 0.75; // 75% or over target time
  }).map((c) => {
    const stageEntered = c.stageDates[c.stage]!;
    const targetHours = targets[c.stage] ?? 24;
    const hoursElapsed = (Date.now() - Date.parse(stageEntered)) / (3600 * 1000);
    return {
      case: c,
      hoursElapsed: Math.round(hoursElapsed),
      targetHours,
      breached: hoursElapsed > targetHours,
    };
  });

  // 3. Clients who replied
  const clientReplies = open.filter((c) => {
    const lastMsg = c.messages[c.messages.length - 1];
    return lastMsg && lastMsg.by === "customer";
  });

  // 4. Documents waiting for review
  const pendingDocs = open.flatMap((c) =>
    c.documents.filter((d) => d.status === "received").map((d) => ({ case: c, doc: d }))
  );

  return {
    todayFollowUps,
    slaCases,
    clientReplies,
    pendingDocs,
    openCasesCount: open.length,
  };
}

// ---------------- admin / overview ----------------
export async function getAdminOverview(rangeDays = 30) {
  const d = await db();
  const now = Date.now();
  const since = now - rangeDays * DAY;
  const prevSince = since - rangeDays * DAY;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  const [cases, accountRows, txs, cats, needsAttention] = await Promise.all([
    loadRequests(),
    d.select({ since: s.accounts.since }).from(s.accounts),
    d.select().from(s.transactions),
    listCategories(),
    getNeedsAttentionCounts(),
  ]);

  const open = cases.filter(isOpen);
  const t = (v: string) => Date.parse(iso(v)!);

  const paidInRange = txs.filter((x) => x.status === "paid" && t(x.at) >= since);
  const paidPrevRange = txs.filter((x) => x.status === "paid" && t(x.at) >= prevSince && t(x.at) < since);
  const refundedInRange = txs.filter((x) => x.status === "refunded" && t(x.at) >= since);

  const ours = paidInRange.reduce((n, x) => n + x.ours, 0);
  const prevOurs = paidPrevRange.reduce((n, x) => n + x.ours, 0);
  const official = paidInRange.reduce((n, x) => n + x.official, 0);
  const gross = ours + official;

  const openedInRange = cases.filter((r) => Date.parse(r.openedAt) >= since);
  const openedPrevRange = cases.filter((r) => Date.parse(r.openedAt) >= prevSince && Date.parse(r.openedAt) < since);

  const completedInRange = cases.filter((r) => r.stage === "completed" && r.stageDates.completed && Date.parse(r.stageDates.completed) >= since);
  const completedPrevRange = cases.filter((r) => r.stage === "completed" && r.stageDates.completed && Date.parse(r.stageDates.completed) >= prevSince && Date.parse(r.stageDates.completed) < since);

  const pending = open.filter((r) => r.billing.quote !== "estimate" && amountDue(r.billing) > 0);
  const totalBalanceDue = pending.reduce((n, r) => n + amountDue(r.billing), 0);

  // Delta helpers: meaningful percentage only when baseline >= 5
  const deltaStr = (current: number, previous: number) => {
    const diff = current - previous;
    const sign = diff >= 0 ? "+" : "";
    if (previous >= 5) {
      const pct = Math.round((diff / previous) * 100);
      return `${sign}${diff} (${sign}${pct}%) vs prev ${rangeDays}d`;
    }
    return `${sign}${diff} vs prev ${rangeDays}d`;
  };

  const revenueDelta = prevOurs >= 50000
    ? `${ours >= prevOurs ? "+" : ""}${rwfShort(ours - prevOurs)} (${ours >= prevOurs ? "+" : ""}${Math.round(((ours - prevOurs) / prevOurs) * 100)}%) vs prev ${rangeDays}d`
    : "";

  // Monthly trend for last 6 months
  const months = Array.from({ length: 6 }, (_, i) => {
    const start = new Date(new Date().getFullYear(), new Date().getMonth() - 5 + i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const inMonth = txs.filter((x) => x.status === "paid" && t(x.at) >= start.getTime() && t(x.at) < end.getTime());
    return {
      label: start.toLocaleString("en-GB", { month: "short", timeZone: "Africa/Kigali" }),
      official: thousands(inMonth.reduce((n, x) => n + x.official, 0)),
      ours: thousands(inMonth.reduce((n, x) => n + x.ours, 0)),
    };
  });

  const popularMap = new Map<string, { n: number; cat: string }>();
  for (const r of openedInRange) {
    popularMap.set(r.service.name, {
      n: (popularMap.get(r.service.name)?.n ?? 0) + 1,
      cat: cats.find((c) => c.id === r.service.category)?.short ?? "",
    });
  }

  // Stage distribution
  const stageCounts: Record<Stage, number> = { received: 0, checking: 0, preparing: 0, institution: 0, completed: 0 };
  for (const r of open) {
    if (stageCounts[r.stage] !== undefined) stageCounts[r.stage]++;
  }

  return {
    period: rangeDays === 7 ? "Last 7 days" : rangeDays === 90 ? "Last 90 days" : "Last 30 days",
    rangeDays,
    needsAttention,
    customers: {
      value: accountRows.length.toLocaleString("en-US"),
      delta: `+${accountRows.filter((a) => t(a.since) >= monthStart).length} this month`,
    },
    activeCases: {
      value: open.length,
      needCustomer: open.filter((r) => r.hold).length,
    },
    opened: {
      value: openedInRange.length,
      delta: deltaStr(openedInRange.length, openedPrevRange.length),
    },
    completed: {
      value: completedInRange.length,
      delta: deltaStr(completedInRange.length, completedPrevRange.length),
    },
    pending: {
      value: rwfShort(totalBalanceDue),
      rawAmount: totalBalanceDue,
      invoices: pending.length,
      overdue: pending.filter((r) => payStatus(r.billing, new Date().toISOString()) === "overdue").length,
    },
    revenue: {
      ours: rwfShort(ours),
      rawOurs: ours,
      delta: revenueDelta,
      official: rwfShort(official),
      rawOfficial: official,
      gross: rwfShort(gross),
      refunds: rwfShort(refundedInRange.reduce((n, x) => n + x.ours + x.official, 0)),
      refundCount: refundedInRange.length,
    },
    monthly: months,
    stageCounts,
    byCategory: cats.filter((c) => !c.href).map((c) => [c.name, open.filter((r) => r.service.category === c.id).length] as [string, number]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]),
    popular: [...popularMap.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([n, v]) => [n, v.n, v.cat] as [string, number, string]),
    recentActivity: cases.flatMap((c) => c.events.map((e) => ({ ...e, ref: c.ref, clientName: c.profile.name }))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 10),
  };
}

export async function getAgentPerformance() {
  const [people, cases] = await Promise.all([listStaff(), loadRequests()]);
  const since30 = Date.now() - 30 * DAY;
  return people.filter((p) => p.role === "Agent" && p.active).map((p) => {
    const mine = cases.filter((r) => r.agentId === p.id);
    const done = mine.filter((r) => r.stage === "completed" && r.stageDates.completed);
    const days = done.map((r) => (Date.parse(r.stageDates.completed!) - Date.parse(r.openedAt)) / DAY);
    const firstTime = done.filter((r) => !r.events.some((e) => e.title.startsWith("Returned"))).length;
    return {
      ...p,
      active: mine.filter(isOpen).length,
      completed: done.filter((r) => Date.parse(r.stageDates.completed!) >= since30).length,
      turnaround: days.length ? `${(days.reduce((a, b) => a + b, 0) / days.length).toFixed(1)} days` : "—",
      firstTime: done.length ? `${Math.round((firstTime / done.length) * 100)}%` : "—",
    };
  });
}

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
