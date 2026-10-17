// Dates a taxpayer has to meet, taken from the RRA service charter (the public deadline table).
// Inzira does not read RRA. A row is "paid" only when someone saves the RRA payment reference.
// Money a client sent to Inzira is a different fact: we hold it, and RRA is still unpaid.

export const TAX_KINDS = [
  { id: "vat-monthly", name: "VAT", rhythm: "The 15th of the next month", charter: "RRA service charter: monthly VAT is paid within 15 days after the month." },
  { id: "vat-quarterly", name: "VAT, quarterly", rhythm: "15 April, 15 July, 15 October, 15 January", charter: "RRA service charter: quarterly VAT is paid within 15 days after the quarter." },
  { id: "paye-monthly", name: "PAYE", rhythm: "The 15th of the next month", charter: "RRA: monthly PAYE is declared and paid by the 15th of the following month." },
  { id: "paye-quarterly", name: "PAYE, quarterly", rhythm: "15 March, 15 June, 15 September, 15 December", charter: "RRA: quarterly PAYE covers March–May, June–August, September–November and December–February, each due on the 15th after that period." },
  { id: "income-instalment", name: "Income tax instalment", rhythm: "30 June, 30 September, 31 December", charter: "RRA service charter: the three income-tax prepayments. The balance is the annual declaration." },
  { id: "income-annual", name: "Annual income tax", rhythm: "31 March of the next year", charter: "RRA service charter: the annual balance is due on 31 March. A taxpayer on a different year tells us, and we move the date." },
  { id: "trading-annual", name: "Trading licence", rhythm: "31 January", charter: "RRA: the annual trading licence is paid by 31 January of the tax year." },
  { id: "trading-quarterly", name: "Trading licence, quarterly", rhythm: "31 January, 30 April, 31 July, 31 October", charter: "RRA: quarterly trading-licence instalments." },
  { id: "property", name: "Property tax", rhythm: "31 December", charter: "RRA service charter: property tax is paid by 31 December of the taxable year." },
  { id: "rental", name: "Rental income tax", rhythm: "31 January of the next year", charter: "RRA service charter: rental income tax is paid by 31 January of the following year." },
  { id: "custom", name: "Another tax", rhythm: "The date you set", charter: "A date from the taxpayer’s own notice. Inzira does not look it up." },
] as const;

export type TaxKind = (typeof TAX_KINDS)[number]["id"];
export type PayRoute = "through_us" | "themselves";
/** What the diary should do about this period. "paid" is the only state that means RRA was paid. */
export type TaxPhase = "paid" | "late" | "money_in" | "awaiting_receipt" | "declared" | "records_due" | "due_soon" | "upcoming";

export type PeriodDraft = {
  periodKey: string;
  periodLabel: string;
  legalDue: string;
  workBy: string;
  recordsBy: string;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const taxKind = (id: string) => TAX_KINDS.find((k) => k.id === id);

export const isTaxKind = (id: string): id is TaxKind => TAX_KINDS.some((k) => k.id === id);

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function utc(y: number, m: number, d: number) {
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso: string, days: number) {
  const p = parts(iso);
  const next = new Date(utc(p.y, p.m, p.d) + days * 86400000);
  return ymd(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function addMonths(y: number, m: number, delta: number) {
  const i = y * 12 + (m - 1) + delta;
  return { y: Math.floor(i / 12), m: (i % 12) + 1 };
}

function weekday(iso: string) {
  const p = parts(iso);
  return new Date(utc(p.y, p.m, p.d)).getUTCDay();
}

/** The RRA date, or the Friday before it when that date is a weekend. Paying on Monday can already be late. */
export function weekdayOnOrBefore(iso: string) {
  const day = weekday(iso);
  if (day === 0) return addDays(iso, -2);
  if (day === 6) return addDays(iso, -1);
  return iso;
}

export function daysBetween(from: string, to: string) {
  const a = parts(from);
  const b = parts(to);
  return Math.round((utc(b.y, b.m, b.d) - utc(a.y, a.m, a.d)) / 86400000);
}

/** Kigali's calendar date. Rwanda is UTC+2 and does not observe daylight saving. */
export function kigaliToday(now = Date.now()) {
  const t = new Date(now + 2 * 3600e3);
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function prettyDate(iso: string) {
  const p = parts(iso);
  return `${WEEKDAYS[weekday(iso)].slice(0, 3)} ${p.d} ${MONTHS[p.m - 1].slice(0, 3)}`;
}

export function fullDate(iso: string) {
  const p = parts(iso);
  return `${WEEKDAYS[weekday(iso)]} ${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

/** How far back and ahead the diary keeps a period. Annual taxes need the long end. */
export function horizon(today: string) {
  return { from: addDays(today, -50), until: addDays(today, 400) };
}

function leadDays(kind: TaxKind) {
  return kind === "vat-monthly" || kind === "paye-monthly" ? 5 : 12;
}

function draft(kind: TaxKind, periodKey: string, periodLabel: string, legalDue: string): PeriodDraft {
  const workBy = weekdayOnOrBefore(legalDue);
  let recordsBy = weekdayOnOrBefore(addDays(workBy, -leadDays(kind)));
  if (recordsBy > workBy) recordsBy = workBy;
  return { periodKey, periodLabel, legalDue, workBy, recordsBy };
}

function inWindow(due: string, from: string, until: string) {
  return due >= from && due <= until;
}

/** The periods whose legal due date falls between `from` and `until`, inclusive. `custom` has none. */
export function periodsBetween(kind: TaxKind, from: string, until: string): PeriodDraft[] {
  const out: PeriodDraft[] = [];
  const start = parts(from);
  const end = parts(until);
  if (kind === "vat-monthly" || kind === "paye-monthly") {
    let cursor = addMonths(start.y, start.m, -2);
    for (let i = 0; i < 30; i++) {
      const dueMonth = addMonths(cursor.y, cursor.m, 1);
      const legalDue = ymd(dueMonth.y, dueMonth.m, 15);
      if (legalDue > until) break;
      if (legalDue >= from) out.push(draft(kind, `${cursor.y}-${pad(cursor.m)}`, `${MONTHS[cursor.m - 1]} ${cursor.y}`, legalDue));
      cursor = addMonths(cursor.y, cursor.m, 1);
    }
    return out;
  }
  for (let y = start.y - 1; y <= end.y + 1; y++) {
    if (kind === "vat-quarterly") {
      const rows = [
        [4, 15, `${y}-vq1`, `January–March ${y}`],
        [7, 15, `${y}-vq2`, `April–June ${y}`],
        [10, 15, `${y}-vq3`, `July–September ${y}`],
        [1, 15, `${y - 1}-vq4`, `October–December ${y - 1}`],
      ] as const;
      for (const [m, d, key, label] of rows) {
        const legalDue = ymd(m === 1 ? y : y, m, d);
        if (inWindow(legalDue, from, until)) out.push(draft(kind, key, label, legalDue));
      }
    } else if (kind === "paye-quarterly") {
      const rows = [
        [3, 15, `${y}-pq-mar`, `December ${y - 1}–February ${y}`],
        [6, 15, `${y}-pq-jun`, `March–May ${y}`],
        [9, 15, `${y}-pq-sep`, `June–August ${y}`],
        [12, 15, `${y}-pq-dec`, `September–November ${y}`],
      ] as const;
      for (const [m, d, key, label] of rows) {
        const legalDue = ymd(y, m, d);
        if (inWindow(legalDue, from, until)) out.push(draft(kind, key, label, legalDue));
      }
    } else if (kind === "income-instalment") {
      const rows = [
        [6, 30, 1, `First instalment ${y}`],
        [9, 30, 2, `Second instalment ${y}`],
        [12, 31, 3, `Third instalment ${y}`],
      ] as const;
      for (const [m, d, n, label] of rows) {
        const legalDue = ymd(y, m, d);
        if (inWindow(legalDue, from, until)) out.push(draft(kind, `${y}-i${n}`, label, legalDue));
      }
    } else if (kind === "income-annual") {
      const legalDue = ymd(y, 3, 31);
      if (inWindow(legalDue, from, until)) out.push(draft(kind, `${y - 1}-annual`, `${y - 1} income tax`, legalDue));
    } else if (kind === "trading-annual") {
      const legalDue = ymd(y, 1, 31);
      if (inWindow(legalDue, from, until)) out.push(draft(kind, `${y}-tl`, `${y} trading licence`, legalDue));
    } else if (kind === "trading-quarterly") {
      const rows = [[1, 31, 1], [4, 30, 2], [7, 31, 3], [10, 31, 4]] as const;
      for (const [m, d, q] of rows) {
        const legalDue = ymd(y, m, d);
        if (inWindow(legalDue, from, until)) out.push(draft(kind, `${y}-tq${q}`, `Quarter ${q} of ${y}`, legalDue));
      }
    } else if (kind === "property") {
      const legalDue = ymd(y, 12, 31);
      if (inWindow(legalDue, from, until)) out.push(draft(kind, `${y}-property`, `${y} property tax`, legalDue));
    } else if (kind === "rental") {
      const legalDue = ymd(y, 1, 31);
      if (inWindow(legalDue, from, until)) out.push(draft(kind, `${y - 1}-rental`, `${y - 1} rental income`, legalDue));
    }
  }
  return out.sort((a, b) => a.legalDue.localeCompare(b.legalDue) || a.periodKey.localeCompare(b.periodKey));
}

export function taxPhase(p: {
  payRoute: PayRoute;
  workBy: string;
  recordsBy: string;
  declarationRef?: string | null;
  paymentRef?: string | null;
  moneyReceipt?: string | null;
}, today: string): TaxPhase {
  if (p.paymentRef) return "paid";
  if (p.workBy < today) return "late";
  if (p.payRoute === "through_us" && p.moneyReceipt) return "money_in";
  if (p.payRoute === "themselves" && (p.declarationRef || p.recordsBy <= today)) return "awaiting_receipt";
  if (p.declarationRef) return "declared";
  if (p.recordsBy <= today) return "records_due";
  if (daysBetween(today, p.workBy) <= 7) return "due_soon";
  return "upcoming";
}

/** Late, money we are holding, or anything unpaid inside a week. Paid rows are quiet. */
export function needsAttention(phase: TaxPhase, daysUntilWorkBy: number) {
  if (phase === "paid" || phase === "upcoming") return false;
  if (phase === "late" || phase === "money_in") return true;
  return daysUntilWorkBy <= 7;
}

export function phaseLabel(phase: TaxPhase) {
  switch (phase) {
    case "paid": return "Paid to RRA";
    case "late": return "Working day has passed";
    case "money_in": return "Money received — pay RRA";
    case "awaiting_receipt": return "Waiting for their receipt";
    case "declared": return "Declared — not paid";
    case "records_due": return "Records due";
    case "due_soon": return "Pay this week";
    case "upcoming": return "Upcoming";
  }
}

/** A reference we will store. A 16-digit value is refused: that shape is a national ID, not an RRA number. */
export function cleanTaxRef(raw: string): string | null {
  const v = raw.trim().replace(/\s+/g, " ");
  if (v.length < 3 || v.length > 40) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9 /-]{2,39}$/.test(v)) return null;
  if (v.replace(/\D/g, "").length === 16) return null;
  return v;
}

export function cleanAmount(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 5_000_000_000) return null;
  return n;
}
