// Pure formatting helpers, safe to use on the server and in the browser.
// Dates are always shown in Kigali time (UTC+2, no daylight saving), computed by hand so the
// server and every browser print exactly the same text.
import type { Billing, Service } from "./types";

const KIGALI = 2 * 36e5;
const DAY = 864e5;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const at = (iso: string) => new Date(Date.parse(iso) + KIGALI);
const two = (n: number) => String(n).padStart(2, "0");
const dayNo = (iso: string) => Math.floor((Date.parse(iso) + KIGALI) / DAY);

export const fmtDay = (iso: string) => `${at(iso).getUTCDate()} ${MON[at(iso).getUTCMonth()]}`;
export const fmtDate = (iso: string) => `${fmtDay(iso)} ${at(iso).getUTCFullYear()}`;
export const fmtTime = (iso: string) => `${two(at(iso).getUTCHours())}:${two(at(iso).getUTCMinutes())}`;
export const fmtLong = (iso: string) => `${WEEKDAY[at(iso).getUTCDay()]}, ${at(iso).getUTCDate()} ${MONTH[at(iso).getUTCMonth()]} ${at(iso).getUTCFullYear()}`;
export const fmtMonth = (iso: string) => `${MONTH[at(iso).getUTCMonth()]} ${at(iso).getUTCFullYear()}`;
export const isSameDay = (a: string, b: string) => dayNo(a) === dayNo(b);
export const dayPart = (iso: string) => (at(iso).getUTCHours() < 12 ? "morning" : at(iso).getUTCHours() < 17 ? "afternoon" : "evening");

const rel = (iso: string, now: string) => {
  const d = dayNo(iso) - dayNo(now);
  return d === 0 ? "Today" : d === -1 ? "Yesterday" : d === 1 ? "Tomorrow" : null;
};
/** "Today", "Yesterday", "Tomorrow" or "27 Sep". */
export const fmtDayRel = (iso: string, now: string) => rel(iso, now) ?? fmtDay(iso);
/** "Today 10:05", "Yesterday 16:02" or "28 Sep 15:20". */
export function fmtWhen(iso: string, now: string) {
  if (Math.abs(Date.parse(now) - Date.parse(iso)) < 60e3) return "Just now";
  return `${fmtDayRel(iso, now)} ${fmtTime(iso)}`;
}
/** "10 min ago", "1 h ago", "Today 09:40", "Yesterday" or "28 Sep". */
export function fmtAgo(iso: string, now: string) {
  const min = Math.round((Date.parse(now) - Date.parse(iso)) / 60e3);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  if (min < 180) return `${Math.floor(min / 60)} h ago`;
  const r = rel(iso, now);
  return r === "Today" ? `Today ${fmtTime(iso)}` : r ?? fmtDay(iso);
}

// ---------------- money ----------------
export const rwf = (n: number) => `RWF ${n.toLocaleString("en-US")}`;
const unit = (u?: string) => (u ? ` ${u}` : "");
/** Whether our fee is paid once, every month or every year (from oursUnit: "per month", "per year", "per UPI, per year"). */
export const billingKind = (s: Service) => (s.oursUnit?.includes("month") ? "monthly" : s.oursUnit?.includes("year") ? "yearly" : "once");

export const officialLabel = (s: Service) => {
  const o = s.official;
  if (o.mode === "none") return o.label ?? "None";
  if (o.mode === "direct") return o.label ?? "Paid by you directly";
  return o.amount === null ? o.label ?? "To be confirmed" : o.amount === 0 ? "Free" : rwf(o.amount);
};
export const oursLabel = (s: Service) => rwf(s.ours) + unit(s.oursUnit);
export const totalLabel = (s: Service) => {
  const o = s.official;
  if (o.mode === "none") return oursLabel(s);
  if (o.mode === "direct") return `${oursLabel(s)} + ${o.label?.toLowerCase().includes("tax") ? "tax due" : "official fee"}`;
  return o.amount === null ? `${oursLabel(s)} + official fee` : rwf(o.amount + s.ours) + unit(s.oursUnit);
};

export const billOfficial = (b: Billing) =>
  b.officialMode === "none" ? "None" : b.officialMode === "direct" ? "Paid by you directly" : b.official === null ? "To be confirmed" : b.official === 0 ? "Free" : rwf(b.official);
export const billOurs = (b: Billing) => rwf(b.ours) + unit(b.oursUnit);
export const billTotal = (b: Billing) => (b.officialMode || b.official === null ? `${rwf(b.ours)}${b.officialMode ? "" : " + official fee"}` : rwf(b.official + b.ours));

// ---------------- names ----------------
export const initials = (name: string) => name.replace(/\./g, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
/** "Eric Niyonzima" -> "Eric N." */
export const shortName = (name: string) => { const p = name.split(" "); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : name; };
export const phoneDigits = (p: string) => p.replace(/\D/g, "").slice(-9);
