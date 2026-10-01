// The data-access layer: every screen reads through these functions, and only they touch the
// database. Writes live in app/actions. Only import this from server code.
import { and, asc, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { getSession, requireCustomerId, requireStaff } from "./auth";
import { db, iso, schema as s } from "./db";
import { fmtDay, phoneDigits, shortName } from "./format";
import { PERMISSION_GROUPS, PERMISSIONS, ROLES, type Permission } from "./permissions";
import { amountDue, isOpen, payStatus } from "./status";
import { STAGES, type Account, type AuditEntry, type Category, type CustomerRequest, type LibraryDoc, type Notification, type Profile, type Request, type RequestView, type Service, type Staff, type TrackResult } from "./types";

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
      profile: { ...profile, relation: profile.relation ?? undefined, idMasked: profile.idMasked ?? undefined, district: profile.district ?? undefined },
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
    profiles: profiles.map((p) => ({ ...p, relation: p.relation ?? undefined, idMasked: p.idMasked ?? undefined, district: p.district ?? undefined })),
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
  return {
    ref: v.ref, name: v.name, via: v.service.via, stage: v.stage, stageDates: v.stageDates, flow: v.flow, labels: v.labels, closed: v.closed, next: v.next,
    hold: v.hold && { reason: v.hold.reason, title: v.hold.title, since: v.hold.since, returned: v.hold.returned },
  };
}

// ---------------- staff ----------------
/** The signed-in member of staff. */
const plain = ({ permissions: _p, ...rest }: Staff & { permissions: Set<Permission> }): Staff => rest;
export const getAgent = async (): Promise<Staff> => plain(await requireStaff("/agent"));
export const getAdmin = async (): Promise<Staff> => plain(await requireStaff("/admin"));
/** What the signed-in member of staff may do, for screens that enable or hide controls. */
export const getMyPermissions = async (): Promise<Permission[]> => [...(await requireStaff()).permissions];
export async function listStaff(): Promise<(Staff & { phone: string | null })[]> {
  return (await db()).select().from(s.staff).orderBy(asc(s.staff.name));
}
/** Cases this person may see: everything with "View all cases", otherwise their own. */
export async function listCases(): Promise<RequestView[]> {
  const me = await requireStaff("/agent");
  const all = me.permissions.has("viewAll");
  return (await loadRequests(all ? undefined : eq(s.requests.agentId, me.id))).sort(byUpdated);
}
export async function getCase(ref: string): Promise<RequestView | undefined> {
  const me = await requireStaff(`/agent/cases/${ref}`);
  const [v] = await loadRequests(eq(s.requests.ref, ref));
  if (!v || (!me.permissions.has("viewAll") && v.agentId !== me.id)) return undefined;
  return v;
}

const thousands = (n: number) => Math.round(n / 100) / 10;
export const rwfShort = (n: number) => (n >= 1e6 ? `RWF ${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M` : n >= 1e4 ? `RWF ${Math.round(n / 1e3)}k` : `RWF ${n.toLocaleString("en-US")}`);

/** An agent's own fee totals for the last five weeks, from real payments. */
export async function getAgentFees() {
  const me = await requireStaff("/agent");
  const d = await db();
  const since = new Date(Date.now() - 35 * DAY);
  const rows = await d.select({ at: s.transactions.at, official: s.transactions.official, ours: s.transactions.ours })
    .from(s.transactions).innerJoin(s.requests, eq(s.requests.ref, s.transactions.ref))
    .where(and(eq(s.requests.agentId, me.id), eq(s.transactions.status, "paid"), gte(s.transactions.at, since.toISOString())));
  const weeks = Array.from({ length: 5 }, (_, i) => {
    const from = new Date(since.getTime() + i * 7 * DAY), to = new Date(from.getTime() + 7 * DAY);
    const inWeek = rows.filter((r) => { const t = Date.parse(iso(r.at)!); return t >= from.getTime() && t < to.getTime(); });
    return { label: fmtDay(from.toISOString()), official: thousands(inWeek.reduce((n, r) => n + r.official, 0)), ours: thousands(inWeek.reduce((n, r) => n + r.ours, 0)) };
  });
  const ours = rows.reduce((n, r) => n + r.ours, 0), official = rows.reduce((n, r) => n + r.official, 0);
  return { period: "Last 5 weeks, by week", ours: rwfShort(ours), official: rwfShort(official), weekly: weeks };
}

// ---------------- admin ----------------
export async function getAdminOverview() {
  const d = await db();
  const now = Date.now(), since30 = now - 30 * DAY, monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const [cases, accountRows, txs, cats] = await Promise.all([
    loadRequests(),
    d.select({ since: s.accounts.since }).from(s.accounts),
    d.select().from(s.transactions),
    listCategories(),
  ]);
  const open = cases.filter(isOpen);
  const t = (v: string) => Date.parse(iso(v)!);
  const paid30 = txs.filter((x) => x.status === "paid" && t(x.at) >= since30);
  const refunded30 = txs.filter((x) => x.status === "refunded" && t(x.at) >= since30);
  const ours = paid30.reduce((n, x) => n + x.ours, 0), official = paid30.reduce((n, x) => n + x.official, 0);
  const prevOurs = txs.filter((x) => x.status === "paid" && t(x.at) >= since30 - 30 * DAY && t(x.at) < since30).reduce((n, x) => n + x.ours, 0);
  const pending = open.filter((r) => r.billing.quote !== "estimate" && amountDue(r.billing) > 0);
  const months = Array.from({ length: 6 }, (_, i) => {
    const start = new Date(new Date().getFullYear(), new Date().getMonth() - 5 + i, 1), end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const inMonth = txs.filter((x) => x.status === "paid" && t(x.at) >= start.getTime() && t(x.at) < end.getTime());
    return { label: start.toLocaleString("en-GB", { month: "short", timeZone: "Africa/Kigali" }), official: thousands(inMonth.reduce((n, x) => n + x.official, 0)), ours: thousands(inMonth.reduce((n, x) => n + x.ours, 0)) };
  });
  const recent = cases.filter((r) => Date.parse(r.openedAt) >= since30);
  const popularMap = new Map<string, { n: number; cat: string }>();
  for (const r of recent) popularMap.set(r.service.name, { n: (popularMap.get(r.service.name)?.n ?? 0) + 1, cat: cats.find((c) => c.id === r.service.category)?.short ?? "" });
  return {
    period: "Last 30 days",
    customers: { value: accountRows.length.toLocaleString("en-US"), delta: `+${accountRows.filter((a) => t(a.since) >= monthStart).length}` },
    activeCases: { value: open.length, needCustomer: open.filter((r) => r.hold).length },
    completed: { value: cases.filter((r) => r.stage === "completed" && r.stageDates.completed && Date.parse(r.stageDates.completed) >= since30).length, delta: "" },
    pending: { value: rwfShort(pending.reduce((n, r) => n + amountDue(r.billing), 0)), invoices: pending.length, overdue: pending.filter((r) => payStatus(r.billing, new Date().toISOString()) === "overdue").length },
    revenue: {
      ours: rwfShort(ours), delta: prevOurs ? `${ours >= prevOurs ? "+" : ""}${Math.round(((ours - prevOurs) / prevOurs) * 100)}% vs the 30 days before` : "",
      official: rwfShort(official), gross: rwfShort(ours + official),
      refunds: rwfShort(refunded30.reduce((n, x) => n + x.ours + x.official, 0)), refundNote: `${refunded30.length} ${refunded30.length === 1 ? "refund" : "refunds"}`,
    },
    monthly: months,
    byCategory: cats.filter((c) => !c.href).map((c) => [c.name, open.filter((r) => r.service.category === c.id).length] as [string, number]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]),
    popular: [...popularMap.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([n, v]) => [n, v.n, v.cat] as [string, number, string]),
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
      ...p, active: mine.filter(isOpen).length, completed: done.filter((r) => Date.parse(r.stageDates.completed!) >= since30).length,
      turnaround: days.length ? `${(days.reduce((a, b) => a + b, 0) / days.length).toFixed(1)} days` : "—",
      firstTime: done.length ? `${Math.round((firstTime / done.length) * 100)}%` : "—",
      rating: "—",
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
