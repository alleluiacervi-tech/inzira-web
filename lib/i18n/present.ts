import type { Category, Service } from "@/lib/types";
import { officialLabel, rwf, shortTime, totalLabel } from "@/lib/format";
import type { Locale } from "./locale";
import { text } from "./messages";
import { checkoutPrice, optionRange } from "@/lib/pricing";
import en from "./catalogue-en.json";
import rw from "./catalogue-rw.json";

type SvcText = {
  feeOptionLabel?: string;
  feeOptions?: string[];
  inPerson?: string;
  name: string;
  aka?: string;
  tagline?: string;
  summary: string;
  authority: string;
  channel: string;
  via: string;
  time: string;
  timeShort?: string;
  docsShort: string;
  who: { title: string; body: string }[];
  requirements: string[];
  documents: { name: string; detail: string }[];
  steps: { title: string; body: string }[];
  notes: { title: string; body: string }[];
  officialNote: string;
  purposeLabel?: string;
  purposes?: string[];
  questions?: { label: string; hint?: string; placeholder?: string }[];
  stageLabels?: Partial<Record<string, string>>;
};
type Cat = {
  categories: Record<string, { name: string; short: string; desc: string }>;
  offices: Record<string, { name: string; area: string; does: string }>;
  services: Record<string, SvcText>;
  units: Record<string, string>;
  officialPhrases: Record<string, string>;
};

const EN = en as unknown as Cat;
const RW = rw as unknown as Cat;
const bag = (locale: Locale) => (locale === "rw" ? RW : EN);

const docNames = new Map<string, string>();
const channels = new Map<string, string>();
for (const [slug, src] of Object.entries(EN.services)) {
  src.documents.forEach((d, i) => {
    const next = RW.services[slug]?.documents[i]?.name;
    if (next && next !== d.name) docNames.set(d.name, next);
  });
  const channel = RW.services[slug]?.channel;
  if (src.channel && channel) channels.set(src.channel, channel);
}

/** Display copy only. Slug, amounts, oursUnit and official.label stay as stored. */
export function localizeService<T extends Service>(s: T, locale: Locale): T {
  if (locale !== "rw") return s;
  const t = RW.services[s.slug];
  if (!t) return s;
  return {
    ...s,
    name: t.name || s.name,
    aka: t.aka || s.aka,
    tagline: s.tagline && (t.tagline || s.tagline),
    summary: t.summary || s.summary,
    authority: t.authority || s.authority,
    channel: t.channel || s.channel,
    via: t.via || s.via,
    time: t.time || s.time,
    docsShort: t.docsShort || s.docsShort,
    who: s.who.map((w, i) => ({ ...w, title: t.who[i]?.title || w.title, body: t.who[i]?.body || w.body })),
    requirements: t.requirements?.length === s.requirements.length ? t.requirements : s.requirements,
    documents: s.documents.map((d, i) => ({ ...d, name: t.documents[i]?.name || d.name, detail: t.documents[i]?.detail || d.detail })),
    steps: s.steps.map((st, i) => ({ ...st, title: t.steps[i]?.title || st.title, body: t.steps[i]?.body || st.body })),
    notes: s.notes.map((n, i) => ({ ...n, title: t.notes[i]?.title || n.title, body: t.notes[i]?.body || n.body })),
    official: { ...s.official, note: t.officialNote || s.official.note },
    purposes: t.purposes?.length && s.purposes?.length ? t.purposes : s.purposes,
    questions: s.questions?.map((q, i) => ({ ...q, label: t.questions?.[i]?.label || q.label, hint: q.hint && (t.questions?.[i]?.hint || q.hint), placeholder: q.placeholder && (t.questions?.[i]?.placeholder || q.placeholder) })),
    purposeLabel: t.purposeLabel || s.purposeLabel,
    feeOptionLabel: t.feeOptionLabel || s.feeOptionLabel,
    feeOptions: s.feeOptions?.map((o, i) => ({ ...o, label: t.feeOptions?.[i] || o.label })),
    inPerson: s.inPerson && (t.inPerson || s.inPerson),
    stageLabels: t.stageLabels ? { ...s.stageLabels, ...(t.stageLabels as Service["stageLabels"]) } : s.stageLabels,
  };
}

export const localizeServices = <T extends Service>(list: T[], locale: Locale) => list.map((s) => localizeService(s, locale));

export function localizeCategory<T extends Category>(c: T, locale: Locale): T {
  if (locale !== "rw") return c;
  const t = RW.categories[c.id];
  return t ? { ...c, name: t.name || c.name, short: t.short || c.short, desc: t.desc || c.desc } : c;
}

export function officeText(code: string, locale: Locale) {
  return bag(locale).offices[code] ?? EN.offices[code];
}

export function unitLabel(unit: string | undefined, locale: Locale) {
  if (!unit) return "";
  if (locale !== "rw") return unit;
  return RW.units[unit] || unit;
}

export function phrase(locale: Locale, english: string) {
  if (locale !== "rw") return english;
  return RW.officialPhrases[english] || english;
}

/** Fee captions stored in English, including "Official fee · RDB online registration". */
export function feeCaption(locale: Locale, label: string) {
  if (locale !== "rw" || !label) return label;
  const exact = RW.officialPhrases[label];
  if (exact) return exact;
  const parts = label.split(" · ");
  if (parts.length < 2) return label;
  return parts.map((part) => RW.officialPhrases[part] || channels.get(part) || part).join(" · ");
}

export function teamName(name: string, locale: Locale) {
  if (locale !== "rw") return name;
  const key = `teams.${name}`;
  const value = text(locale, key);
  return value === key ? name : value;
}

export function displayOurs(s: Service, locale: Locale) {
  return rwf(s.ours) + (s.oursUnit ? ` ${unitLabel(s.oursUnit, locale)}` : "");
}

export function displayOfficial(s: Service, locale: Locale) {
  return phrase(locale, officialLabel(s));
}

/** Same split as totalLabel, with the tax check still done on the English official.label. */
export function displayTotal(s: Service, locale: Locale) {
  if (locale !== "rw") return totalLabel(s);
  const o = s.official;
  if (o.amount === null && !o.mode && s.feeOptions?.length) return totalLabel(s);
  const ours = displayOurs(s, locale);
  if (o.mode === "none") return ours;
  if (o.mode === "direct") return `${ours} + ${phrase(locale, o.label?.toLowerCase().includes("tax") ? "tax due" : "official fee")}`;
  if (o.amount === null) return `${ours} + ${phrase(locale, "official fee")}`;
  return rwf(o.amount + s.ours) + (s.oursUnit ? ` ${unitLabel(s.oursUnit, locale)}` : "");
}

/** What a customer pays, as one figure and a short qualifier, the same on every page: the whole price where it is
 *  settled ("RWF 2,500", "all in"), or our fee and what is paid elsewhere ("RWF 2,000", "+ Irembo fee"), with the
 *  unit for yearly and monthly work ("RWF 5,000", "per year + tax"). */
export function displayPrice(s: Service, locale: Locale): { amount: string; note: string } {
  const o = s.official;
  const unit = s.oursUnit ? unitLabel(s.oursUnit, locale) : "";
  const settled = checkoutPrice(s);
  if (settled) return { amount: rwf(settled.total), note: o.mode === "none" ? unit : text(locale, "price.allIn") };
  // Priced by option (passport type, test type): the lowest total, all in.
  const range = optionRange(s);
  if (range) return { amount: `${text(locale, "price.from")} ${rwf(range.from)}`, note: text(locale, "price.allIn") };
  const label = `${o.label ?? ""} ${o.note}`.toLowerCase();
  const extra = o.mode === "none" ? "" : o.mode === "direct" && label.includes("irembo") ? text(locale, "price.plusIrembo")
    : o.mode === "direct" && /tax|district/.test(label) ? text(locale, "price.plusTax") : text(locale, "price.plusOfficial");
  return { amount: rwf(s.ours), note: [unit, extra].filter(Boolean).join(" ") };
}

export function displayTime(s: Service, locale: Locale) {
  if (locale !== "rw") return shortTime(s.time);
  return RW.services[s.slug]?.timeShort || s.time;
}

/** English plus Kinyarwanda, so search works in either language. */
export function searchText(s: Service) {
  const extra = EN.services[s.slug];
  return [s.name, s.aka, s.summary, s.authority, s.channel, extra?.name, extra?.aka, extra?.summary, extra?.authority].filter(Boolean).join(" ");
}

export function displayDocName(name: string, locale: Locale) {
  return locale === "rw" ? docNames.get(name) || name : name;
}

/** Show the translated service name when the request title is still the English catalogue name. */
export function requestTitle(name: string, service: Service, locale: Locale) {
  if (locale !== "rw") return name;
  const local = RW.services[service.slug]?.name;
  if (!local || local === service.name) return name;
  if (name === service.name) return local;
  if (name.startsWith(`${service.name} `) || name.startsWith(`${service.name}·`) || name.startsWith(`${service.name} ·`)) return local + name.slice(service.name.length);
  return name;
}

/** A service's name in this language, from its slug; the stored English name when it has no translation. */
export function serviceName(slug: string | undefined, english: string, locale: Locale) {
  if (locale !== "rw" || !slug) return english;
  return RW.services[slug]?.name || english;
}

/** An official channel's name in this language, e.g. "RDB online registration". */
export function channelName(channel: string, locale: Locale) {
  return locale === "rw" ? channels.get(channel) || channel : channel;
}

/** A payment method in this language; brand names (MTN MoMo, Airtel Money) stay as they are. */
export function methodName(method: string, locale: Locale) {
  const path = `pay.methods.${method}`;
  const name = text(locale, path);
  return name === path ? method : name;
}

export function requestChannel(channel: string, service: Service, locale: Locale) {
  if (locale === "rw" && channel === service.channel) return RW.services[service.slug]?.channel || channel;
  return channel;
}
