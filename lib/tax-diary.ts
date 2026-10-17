// The staff tax diary. Dates come from lib/tax-calendar. Nothing here calls RRA.
import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { seesAllCases } from "./access";
import { db, iso, schema as s, type Db } from "./db";
import { audit } from "./mutate";
import type { Permission } from "./permissions";
import {
  TAX_KINDS, addDays, cleanAmount, cleanTaxRef, daysBetween, horizon, isTaxKind, kigaliToday, needsAttention, periodsBetween, taxKind, taxPhase, weekdayOnOrBefore,
  type PayRoute, type TaxKind, type TaxPhase,
} from "./tax-calendar";

type Viewer = { id: string; name: string; role: string; permissions: Set<Permission> };
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const id = () => randomBytes(9).toString("hex");

export type DiaryRow = {
  id: string;
  watchId: string;
  profileId: string;
  client: string;
  kind: TaxKind;
  kindName: string;
  charter: string;
  periodLabel: string;
  legalDue: string;
  workBy: string;
  recordsBy: string;
  payRoute: PayRoute;
  phase: TaxPhase;
  days: number;
  attention: boolean;
  declarationRef: string | null;
  paymentRef: string | null;
  amountDue: number | null;
  moneyReceipt: string | null;
  moneyAmount: number | null;
  requestRef: string | null;
  active: boolean;
};

async function visibleProfileIds(d: Db, me: Viewer): Promise<string[] | "all"> {
  if (seesAllCases(me)) return "all";
  const rows = await d.select({ id: s.requests.profileId }).from(s.requests).where(eq(s.requests.agentId, me.id));
  return [...new Set(rows.map((r) => r.id))];
}

/** Fills any charter period that is not stored yet. Existing rows, including recorded references, stay as they are. */
export async function ensurePeriods(database: Db | Tx, today = kigaliToday()) {
  const watches = await database.select().from(s.taxWatches).where(eq(s.taxWatches.active, true));
  const { from, until } = horizon(today);
  const rows = watches.flatMap((w) => {
    if (!isTaxKind(w.kind) || w.kind === "custom") return [];
    return periodsBetween(w.kind, from, until).map((p) => ({
      id: `${w.id}:${p.periodKey}`,
      watchId: w.id,
      profileId: w.profileId,
      kind: w.kind,
      periodKey: p.periodKey,
      periodLabel: p.periodLabel,
      legalDue: p.legalDue,
      workBy: p.workBy,
      recordsBy: p.recordsBy,
      payRoute: w.payRoute,
    }));
  });
  if (rows.length) await database.insert(s.taxPeriods).values(rows).onConflictDoNothing();
  await pullClientMoney(database);
}

/** A paid Inzira invoice that includes an official amount means the client sent tax money. It does not mean RRA was paid. */
async function pullClientMoney(database: Db | Tx) {
  const open = await database.select().from(s.taxPeriods).where(and(
    eq(s.taxPeriods.payRoute, "through_us"),
    isNull(s.taxPeriods.moneyReceipt),
    isNull(s.taxPeriods.paymentRef),
    isNotNull(s.taxPeriods.requestRef),
  ));
  if (!open.length) return;
  const txs = await database.select().from(s.transactions).where(and(
    inArray(s.transactions.ref, open.map((p) => p.requestRef!)),
    eq(s.transactions.status, "paid"),
  ));
  for (const period of open) {
    const paid = txs.filter((t) => t.ref === period.requestRef && t.official > 0);
    if (!paid.length) continue;
    const latest = paid.sort((a, b) => Date.parse(iso(b.at) ?? "") - Date.parse(iso(a.at) ?? ""))[0];
    await database.update(s.taxPeriods).set({
      moneyReceipt: latest.receipt,
      moneyAmount: paid.reduce((n, t) => n + t.official, 0),
      moneyAt: latest.at,
    }).where(and(eq(s.taxPeriods.id, period.id), isNull(s.taxPeriods.moneyReceipt)));
  }
}

export async function listDiary(me: Viewer, opts: { today?: string; profileId?: string } = {}): Promise<{ today: string; rows: DiaryRow[]; clients: { id: string; name: string }[] }> {
  const d = await db();
  const today = opts.today ?? kigaliToday();
  await ensurePeriods(d, today);
  const visible = await visibleProfileIds(d, me);
  const [periods, profiles] = await Promise.all([
    d.select({
      period: s.taxPeriods,
      client: s.profiles.name,
      active: s.taxWatches.active,
    }).from(s.taxPeriods)
      .innerJoin(s.taxWatches, eq(s.taxWatches.id, s.taxPeriods.watchId))
      .innerJoin(s.profiles, eq(s.profiles.id, s.taxPeriods.profileId))
      .innerJoin(s.accounts, eq(s.accounts.id, s.profiles.accountId))
      .where(and(isNull(s.accounts.deletedAt), or(eq(s.taxWatches.active, true), isNotNull(s.taxPeriods.paymentRef)))),
    d.select({ id: s.profiles.id, name: s.profiles.name }).from(s.profiles).innerJoin(s.accounts, eq(s.accounts.id, s.profiles.accountId)).where(isNull(s.accounts.deletedAt)),
  ]);
  const allowed = new Set(visible === "all" ? profiles.map((p) => p.id) : visible);
  const rows = periods.flatMap(({ period, client, active }) => {
    if (!allowed.has(period.profileId)) return [];
    if (opts.profileId && period.profileId !== opts.profileId) return [];
    if (!isTaxKind(period.kind)) return [];
    const kind = taxKind(period.kind)!;
    const payRoute: PayRoute = period.payRoute === "through_us" ? "through_us" : "themselves";
    const phase = taxPhase({
      payRoute, workBy: period.workBy, recordsBy: period.recordsBy,
      declarationRef: period.declarationRef, paymentRef: period.paymentRef, moneyReceipt: period.moneyReceipt,
    }, today);
    const days = daysBetween(today, period.workBy);
    return [{
      id: period.id, watchId: period.watchId, profileId: period.profileId, client, kind: period.kind, kindName: kind.name, charter: kind.charter,
      periodLabel: period.periodLabel, legalDue: period.legalDue, workBy: period.workBy, recordsBy: period.recordsBy, payRoute, phase, days,
      attention: needsAttention(phase, days),
      declarationRef: period.declarationRef, paymentRef: period.paymentRef, amountDue: period.amountDue,
      moneyReceipt: period.moneyReceipt, moneyAmount: period.moneyAmount, requestRef: period.requestRef,
      active,
    }];
  }).sort((a, b) => a.workBy.localeCompare(b.workBy) || a.client.localeCompare(b.client));
  const clients = profiles.filter((p) => allowed.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  return { today, rows, clients };
}

export async function countTaxAttention(today = kigaliToday()) {
  const d = await db();
  await ensurePeriods(d, today);
  const periods = await d.select({
    payRoute: s.taxPeriods.payRoute, workBy: s.taxPeriods.workBy, recordsBy: s.taxPeriods.recordsBy,
    declarationRef: s.taxPeriods.declarationRef, paymentRef: s.taxPeriods.paymentRef, moneyReceipt: s.taxPeriods.moneyReceipt,
  }).from(s.taxPeriods)
    .innerJoin(s.taxWatches, eq(s.taxWatches.id, s.taxPeriods.watchId))
    .innerJoin(s.profiles, eq(s.profiles.id, s.taxPeriods.profileId))
    .innerJoin(s.accounts, eq(s.accounts.id, s.profiles.accountId))
    .where(and(isNull(s.accounts.deletedAt), eq(s.taxWatches.active, true)));
  return periods.filter((p) => {
    const payRoute: PayRoute = p.payRoute === "through_us" ? "through_us" : "themselves";
    const phase = taxPhase({ payRoute, workBy: p.workBy, recordsBy: p.recordsBy, declarationRef: p.declarationRef, paymentRef: p.paymentRef, moneyReceipt: p.moneyReceipt }, today);
    return needsAttention(phase, daysBetween(today, p.workBy));
  }).length;
}

function routeOf(raw: string): PayRoute | null {
  return raw === "through_us" || raw === "themselves" ? raw : null;
}

export async function addWatch(me: Viewer, input: { profileId: string; kind: string; payRoute: string; note?: string }) {
  const d = await db();
  const visible = await visibleProfileIds(d, me);
  if (visible !== "all" && !visible.includes(input.profileId)) return { ok: false as const, error: "Client not found." };
  if (!isTaxKind(input.kind) || input.kind === "custom") return { ok: false as const, error: "Choose the tax." };
  const payRoute = routeOf(input.payRoute);
  if (!payRoute) return { ok: false as const, error: "Say whether Inzira pays RRA or the client pays RRA." };
  const [profile] = await d.select({ id: s.profiles.id, name: s.profiles.name }).from(s.profiles).where(eq(s.profiles.id, input.profileId));
  if (!profile) return { ok: false as const, error: "Client not found." };
  const kind = taxKind(input.kind)!;
  try {
    await d.insert(s.taxWatches).values({
      id: id(), profileId: profile.id, kind: input.kind, payRoute, note: input.note?.trim().slice(0, 240) || null, createdBy: me.name,
    });
  } catch (err) {
    const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") return { ok: false as const, error: `${profile.name} is already on the diary for ${kind.name}.` };
    throw err;
  }
  await ensurePeriods(d);
  await audit(d, { actor: me.name, role: me.role, action: "Added a tax to the diary", entity: `${profile.name} · ${kind.name}` });
  return { ok: true as const };
}

export async function addCustomPeriod(me: Viewer, input: { profileId: string; label: string; legalDue: string; payRoute: string }) {
  const d = await db();
  const visible = await visibleProfileIds(d, me);
  if (visible !== "all" && !visible.includes(input.profileId)) return { ok: false as const, error: "Client not found." };
  const payRoute = routeOf(input.payRoute);
  if (!payRoute) return { ok: false as const, error: "Say who pays RRA." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.legalDue)) return { ok: false as const, error: "Enter the RRA date." };
  const label = input.label.trim().slice(0, 80);
  if (label.length < 3) return { ok: false as const, error: "Name the tax." };
  const [profile] = await d.select({ name: s.profiles.name }).from(s.profiles).where(eq(s.profiles.id, input.profileId));
  if (!profile) return { ok: false as const, error: "Client not found." };
  const due = weekdayOnOrBefore(input.legalDue);
  let recordsBy = weekdayOnOrBefore(addDays(due, -12));
  if (recordsBy > due) recordsBy = due;
  const watch = id();
  await d.insert(s.taxWatches).values({ id: watch, profileId: input.profileId, kind: "custom", payRoute, createdBy: me.name });
  await d.insert(s.taxPeriods).values({
    id: `${watch}:once`, watchId: watch, profileId: input.profileId, kind: "custom", periodKey: "once", periodLabel: label,
    legalDue: input.legalDue, workBy: due, recordsBy, payRoute,
  });
  await audit(d, { actor: me.name, role: me.role, action: "Added a tax date", entity: `${profile.name} · ${label}` });
  return { ok: true as const };
}

async function periodFor(me: Viewer, periodId: string) {
  const d = await db();
  const [row] = await d.select({ period: s.taxPeriods, client: s.profiles.name }).from(s.taxPeriods).innerJoin(s.profiles, eq(s.profiles.id, s.taxPeriods.profileId)).where(eq(s.taxPeriods.id, periodId));
  if (!row) return { error: "That tax date was not found." } as const;
  const visible = await visibleProfileIds(d, me);
  if (visible !== "all" && !visible.includes(row.period.profileId)) return { error: "That tax date was not found." } as const;
  return { d, ...row };
}

export async function recordDeclaration(me: Viewer, periodId: string, refRaw: string, amountRaw: string) {
  const found = await periodFor(me, periodId);
  if ("error" in found) return { ok: false as const, error: found.error };
  const ref = cleanTaxRef(refRaw);
  if (!ref) return { ok: false as const, error: "Enter the RRA declaration reference. A national ID number is not a reference." };
  const amount = amountRaw.trim() ? cleanAmount(amountRaw) : found.period.amountDue;
  if (amountRaw.trim() && amount === null) return { ok: false as const, error: "Enter the tax amount in francs, or leave it blank." };
  await found.d.update(s.taxPeriods).set({ declarationRef: ref, amountDue: amount, declaredAt: new Date().toISOString() }).where(eq(s.taxPeriods.id, periodId));
  await audit(found.d, { actor: me.name, role: me.role, action: "Saved an RRA declaration reference", entity: `${found.client} · ${found.period.periodLabel}` });
  return { ok: true as const };
}

/** The only write that marks the tax paid. A transfer to Inzira does not. */
export async function recordRraPayment(me: Viewer, periodId: string, refRaw: string) {
  const found = await periodFor(me, periodId);
  if ("error" in found) return { ok: false as const, error: found.error };
  const ref = cleanTaxRef(refRaw);
  if (!ref) return { ok: false as const, error: "Enter the RRA payment reference. A national ID number is not a reference." };
  await found.d.update(s.taxPeriods).set({ paymentRef: ref, paidAt: new Date().toISOString(), paidBy: me.name }).where(eq(s.taxPeriods.id, periodId));
  await audit(found.d, { actor: me.name, role: me.role, action: "Saved an RRA payment reference", entity: `${found.client} · ${found.period.periodLabel}`, fee: true });
  return { ok: true as const };
}

export async function recordMoney(me: Viewer, periodId: string, receiptRaw: string, amountRaw: string) {
  const found = await periodFor(me, periodId);
  if ("error" in found) return { ok: false as const, error: found.error };
  if (found.period.payRoute !== "through_us") return { ok: false as const, error: "This client pays RRA themselves. Record their RRA receipt, not a transfer to Inzira." };
  const receipt = cleanTaxRef(receiptRaw);
  if (!receipt) return { ok: false as const, error: "Enter the Inzira receipt." };
  const amount = cleanAmount(amountRaw);
  if (amount === null) return { ok: false as const, error: "Enter how many francs they sent." };
  await found.d.update(s.taxPeriods).set({ moneyReceipt: receipt, moneyAmount: amount, moneyAt: new Date().toISOString() }).where(eq(s.taxPeriods.id, periodId));
  await audit(found.d, { actor: me.name, role: me.role, action: "Recorded tax money received", entity: `${found.client} · ${found.period.periodLabel} · ${receipt}`, fee: true });
  return { ok: true as const };
}

export async function linkRequest(me: Viewer, periodId: string, refRaw: string) {
  const found = await periodFor(me, periodId);
  if ("error" in found) return { ok: false as const, error: found.error };
  const ref = refRaw.trim().toUpperCase();
  if (!/^INZ-\d{4}-\d{5}$/.test(ref)) return { ok: false as const, error: "Enter the request reference, like INZ-2026-04112." };
  const [req] = await found.d.select({ profileId: s.requests.profileId }).from(s.requests).where(eq(s.requests.ref, ref));
  if (!req || req.profileId !== found.period.profileId) return { ok: false as const, error: "That request is not this client’s." };
  await found.d.update(s.taxPeriods).set({ requestRef: ref }).where(eq(s.taxPeriods.id, periodId));
  await pullClientMoney(found.d);
  await audit(found.d, { actor: me.name, role: me.role, action: "Linked a request to a tax date", entity: `${found.client} · ${ref}` });
  return { ok: true as const };
}

export async function stopWatch(me: Viewer, watchId: string) {
  const d = await db();
  const [row] = await d.select({ watch: s.taxWatches, client: s.profiles.name }).from(s.taxWatches).innerJoin(s.profiles, eq(s.profiles.id, s.taxWatches.profileId)).where(eq(s.taxWatches.id, watchId));
  if (!row) return { ok: false as const, error: "That tax was not found." };
  const visible = await visibleProfileIds(d, me);
  if (visible !== "all" && !visible.includes(row.watch.profileId)) return { ok: false as const, error: "That tax was not found." };
  await d.update(s.taxWatches).set({ active: false }).where(eq(s.taxWatches.id, watchId));
  await audit(d, { actor: me.name, role: me.role, action: "Stopped watching a tax", entity: `${row.client} · ${taxKind(row.watch.kind)?.name ?? row.watch.kind}` });
  return { ok: true as const };
}

export { TAX_KINDS };
