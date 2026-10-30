// What can be edited in Admin › Kinyarwanda text, and how it is checked. No database: this is the list of strings the
// site has (from the English files and the services), grouped into the screens an administrator thinks in.
// A string is addressed by its key: "ui:<path in rw.json>" or "cat:<path in catalogue-rw.json>" (lib/i18n/live.ts).
import catalogueEn from "./i18n/catalogue-en.json";
import en from "./i18n/en.json";
import { CAT, UI, getPath, liveCatalogue, liveRw, managedKey, shippedCatalogue, shippedRw } from "./i18n/live";
import { long, pathInService, serviceFields, variablesOf, words, type Field, type ServiceRw, type ServiceText } from "./service-text";

/** A string as the editor shows it. */
export type Row = Field & {
  /** The text shipped with the site. Empty when the site has no Kinyarwanda for it yet. */
  shipped: string;
  /** What the site shows now: the edit when there is one, otherwise the shipped text. */
  value: string;
  edited: boolean;
  /** {names} the text must keep. */
  vars: string[];
};
export { variablesOf, serviceFields, type Field, type ServiceText };
export type SectionKind = "ui" | "catalogue" | "service";
export type Section = { kind: SectionKind; id: string; title: string; hint: string; preview: string };
export type Counts = { total: number; edited: number; missing: number };

/** SMS texts must stay in the GSM-7 alphabet and within two messages (scripts/i18n-check.mjs), which this editor cannot check. */
const NOT_EDITABLE = new Set(["sms"]);
/** The longest text one string may hold. */
export const MAX_TEXT = 4000;
/** The most strings one save may change. */
export const MAX_CHANGES = 300;

// ---------------- the screens of the site ----------------
const UI_GROUPS: { id: string; title: string; hint: string; preview: string; keys: string[] }[] = [
  { id: "home", title: "Home page", hint: "The first page visitors see: hero, how it works, opening hours, contact.", preview: "/", keys: ["home", "steps", "contact", "hours", "responseTime"] },
  { id: "menu", title: "Menu, footer & page titles", hint: "The top menu, the footer, and the titles and descriptions shown in Google results and browser tabs.", preview: "/", keys: ["nav", "footer", "meta", "notFound", "error", "demo"] },
  { id: "about", title: "About page", hint: "Who Inzira is.", preview: "/about", keys: ["about"] },
  { id: "legal", title: "Privacy & terms", hint: "The privacy notice and the terms of service.", preview: "/privacy", keys: ["legal"] },
  { id: "services-pages", title: "Services pages", hint: "The labels on the services list and on every service page. The text of each service is under Services.", preview: "/services", keys: ["catalogue", "service", "prices", "price", "feeTag"] },
  { id: "start", title: "Starting a request", hint: "The form a customer fills in to start a request.", preview: "/services", keys: ["start", "link"] },
  { id: "sign-in", title: "Sign-in & codes", hint: "Customer sign-in, the codes people receive, and the errors they can meet.", preview: "/sign-in", keys: ["signIn", "code", "authErr", "custErr"] },
  { id: "track", title: "Track a request", hint: "The page where a customer looks up a request.", preview: "/track", keys: ["track"] },
  { id: "portal", title: "Customer account", hint: "What a signed-in customer sees: requests, documents and settings.", preview: "/portal", keys: ["portal", "shell", "portalBanner", "request", "teams", "status", "doc", "groups", "docs", "account", "dates", "side", "fileRoute"] },
  { id: "payment", title: "Payment", hint: "The payment screen and its messages.", preview: "/portal", keys: ["pay", "receipt"] },
  { id: "updates", title: "Customer updates & emails", hint: "The lines on a request's timeline, notifications and emails. They are written once and shown in the reader's language.", preview: "/portal", keys: ["stored", "email"] },
];
const CATALOGUE_GROUPS: { id: string; title: string; hint: string; keys: ("categories" | "offices" | "units" | "officialPhrases")[] }[] = [
  { id: "categories", title: "Service categories", hint: "The names and descriptions of the categories on the home page and the services list.", keys: ["categories"] },
  { id: "offices", title: "Institutions", hint: "What each institution (RDB, RRA, NLA…) is and does.", keys: ["offices"] },
  { id: "fees", title: "Fee wording", hint: "Phrases such as “Official fee”, “To be confirmed” and the units after a price (“per year”).", keys: ["units", "officialPhrases"] },
];

/** Names for the parts of rw.json whose own names are short codes. */
const PART_NAMES: Record<string, string> = {
  "stored.ev": "Timeline line", "stored.nt": "Notification", "stored.sum": "Request summary", "stored.hold": "Hold", "stored.closed": "Closed request",
  "stored.fee": "Fee wording", "stored.docNote": "Document note", authErr: "Sign-in error", custErr: "Error message", meta: "Page title", nav: "Menu",
};
const labelOf = (path: string[]) => {
  const two = PART_NAMES[path.slice(0, 2).join(".")];
  if (two) return [two, ...path.slice(2).map(words)].join(" › ");
  const one = PART_NAMES[path[0]];
  return [one ?? words(path[0]), ...path.slice(1).map(words)].join(" › ");
};
function leaves(node: unknown, path: string[] = [], out: { path: string[]; text: string }[] = []) {
  if (typeof node === "string") out.push({ path, text: node });
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) leaves(v, [...path, k], out);
  return out;
}

const uiField = (path: string[], text: string): Field => ({ key: `${UI}${path.join(".")}`, label: labelOf(path), en: text, long: long(text) });
function uiGroupFields(keys: string[]): Field[] {
  return keys.filter((k) => !NOT_EDITABLE.has(k)).flatMap((k) => leaves((en as Record<string, unknown>)[k], [k]).map((l) => uiField(l.path, l.text)));
}
const catalogueField = (path: string[], text: string): Field => ({ key: `${CAT}${path.join(".")}`, label: path.slice(1).map(words).join(" › "), en: text, long: long(text) });

// ---------------- sections ----------------
export function sections(services: ServiceText[]): { ui: Section[]; catalogue: Section[]; services: Section[] } {
  const known = new Set(UI_GROUPS.flatMap((g) => g.keys));
  const rest = Object.keys(en).filter((k) => !known.has(k) && !NOT_EDITABLE.has(k));
  return {
    ui: [
      ...UI_GROUPS.map((g): Section => ({ kind: "ui", id: g.id, title: g.title, hint: g.hint, preview: g.preview })),
      ...(rest.length ? [{ kind: "ui", id: "other", title: "Other text", hint: "Text that belongs to no screen above.", preview: "/" } as Section] : []),
    ],
    catalogue: CATALOGUE_GROUPS.map((g): Section => ({ kind: "catalogue", id: g.id, title: g.title, hint: g.hint, preview: "/services" })),
    services: services.map((s): Section => ({ kind: "service", id: s.slug, title: s.name, hint: "Every line of this service page.", preview: `/services/${s.slug}` })),
  };
}

/** The strings of one section. */
export function sectionFields(kind: SectionKind, id: string, services: ServiceText[]): Field[] | undefined {
  if (kind === "ui") {
    const group = UI_GROUPS.find((g) => g.id === id);
    if (group) return uiGroupFields(group.keys);
    if (id === "other") {
      const known = new Set(UI_GROUPS.flatMap((g) => g.keys));
      return uiGroupFields(Object.keys(en).filter((k) => !known.has(k)));
    }
    return undefined;
  }
  if (kind === "catalogue") {
    const group = CATALOGUE_GROUPS.find((g) => g.id === id);
    return group && group.keys.flatMap((k) => leaves((catalogueEn as Record<string, unknown>)[k], [k]).map((l) => catalogueField(l.path, l.text)));
  }
  const service = services.find((s) => s.slug === id);
  return service && serviceFields(service);
}

/** Every string the site can have edited, by key. */
export function allFields(services: ServiceText[]): Map<string, Field> {
  const map = new Map<string, Field>();
  const put = (f: Field) => { if (!map.has(f.key)) map.set(f.key, f); };
  for (const g of UI_GROUPS) uiGroupFields(g.keys).forEach(put);
  const known = new Set(UI_GROUPS.flatMap((g) => g.keys));
  uiGroupFields(Object.keys(en).filter((k) => !known.has(k))).forEach(put);
  for (const g of CATALOGUE_GROUPS) for (const k of g.keys) leaves((catalogueEn as Record<string, unknown>)[k], [k]).forEach((l) => put(catalogueField(l.path, l.text)));
  for (const s of services) serviceFields(s).forEach(put);
  return map;
}

// ---------------- rows ----------------
/** The strings as the editor shows them, against the edits made so far. */
export function rowsFor(fields: Field[], entries: Record<string, string>): Row[] {
  return fields.map((f) => {
    const ui = f.key.startsWith(UI);
    const path = f.key.slice(ui ? UI.length : CAT.length);
    const shipped = getPath(ui ? shippedRw() : shippedCatalogue(), path);
    const edit = entries[f.key];
    return { ...f, shipped: typeof shipped === "string" ? shipped : "", value: edit ?? (typeof shipped === "string" ? shipped : ""), edited: edit !== undefined, vars: variablesOf(f.en) };
  });
}

/** How much of a set of strings is edited, and how much still has no Kinyarwanda (visitors see English there). */
export function countRows(fields: Field[], entries: Record<string, string>): Counts {
  let edited = 0, missing = 0;
  for (const f of fields) {
    if (entries[f.key] !== undefined) edited++;
    const ui = f.key.startsWith(UI);
    const now = getPath(ui ? liveRw() : liveCatalogue(), f.key.slice(ui ? UI.length : CAT.length));
    if (typeof now !== "string" || !now.trim()) missing++;
  }
  return { total: fields.length, edited, missing };
}

// ---------------- checking an edit ----------------
export type Checked = { ok: true; value: string } | { ok: false; error: string };

/** Control characters and invisible separators, which never belong in a sentence (a newline is kept). */
const CONTROL = /(?![\n\t])\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}/gu;

/** Cleans one edited text and checks it against the English it translates. */
export function checkText(field: Field, input: string): Checked {
  let value = input.replace(/\r\n?/g, "\n").replace(CONTROL, "").trim();
  if (!field.long) value = value.replace(/\s*\n\s*/g, " ");
  if (value.length > MAX_TEXT) return { ok: false, error: `Too long: ${value.length.toLocaleString("en")} characters, the most is ${MAX_TEXT.toLocaleString("en")}.` };
  const want = variablesOf(field.en).sort().join(",");
  const have = variablesOf(value).sort().join(",");
  if (value && want !== have) {
    const missing = variablesOf(field.en).filter((v) => !variablesOf(value).includes(v));
    const extra = variablesOf(value).filter((v) => !variablesOf(field.en).includes(v));
    if (missing.length) return { ok: false, error: `Keep ${missing.map((v) => `{${v}}`).join(", ")} exactly as written. The site fills it in.` };
    return { ok: false, error: `${extra.map((v) => `{${v}}`).join(", ")} is not in the English, so the site cannot fill it in.` };
  }
  return { ok: true, value };
}

// ---------------- a service, saved with its Kinyarwanda ----------------
export type ServicePlan = { writes: Map<string, string>; removes: Set<string>; errors: string[] };

/**
 * What to store so a service reads as `rw` (its Kinyarwanda by path, one entry for every line of the English, "" for a line
 * with none). A line equal to the shipped text needs no edit; a line that is empty where the shipped text has something stays as an
 * empty edit, because the shipped line belongs to another item once a list has changed. Edits to lines the service no longer
 * has are removed, and the service is marked as written in the console (lib/i18n/live.ts isManaged).
 */
export function planServiceText(service: ServiceText, rw: ServiceRw, existing: Record<string, string>): ServicePlan {
  const plan: ServicePlan = { writes: new Map(), removes: new Set(), errors: [] };
  const wanted = new Set<string>();
  for (const f of serviceFields(service)) {
    wanted.add(f.key);
    const checked = checkText(f, typeof rw[pathInService(f)] === "string" ? rw[pathInService(f)] : "");
    if (!checked.ok) { plan.errors.push(`${f.label}: ${checked.error}`); continue; }
    const shipped = getPath(shippedCatalogue(), f.key.slice(CAT.length));
    if (checked.value === (typeof shipped === "string" ? shipped : "")) { if (f.key in existing) plan.removes.add(f.key); }
    else if (existing[f.key] !== checked.value) plan.writes.set(f.key, checked.value);
  }
  const prefix = `${CAT}services.${service.slug}.`;
  const marker = managedKey(service.slug);
  for (const key of Object.keys(existing)) if (key.startsWith(prefix) && key !== marker && !wanted.has(key)) plan.removes.add(key);
  if (!(marker in existing)) plan.writes.set(marker, "1");
  return plan;
}

// ---------------- find and replace ----------------
export type Part = { text: string; hit: boolean };
export type Match = { key: string; label: string; section: string; before: Part[]; after: Part[]; next: string };
export type ReplaceInput = { find: string; replace: string; caseSensitive: boolean; wholeWord: boolean };
export const MAX_FIND = 100;

/** Every string with the screen it belongs to, against the edits made so far. */
export function collectRows(services: ServiceText[], entries: Record<string, string>): { row: Row; section: Section }[] {
  const all = sections(services);
  return [...all.ui, ...all.catalogue, ...all.services].flatMap((section) =>
    rowsFor(sectionFields(section.kind, section.id, services) ?? [], entries).map((row) => ({ row, section })));
}

/** The pattern for what to find: the words typed, not a regular expression. Undefined when there is nothing to find. */
export function findPattern({ find, caseSensitive, wholeWord }: Pick<ReplaceInput, "find" | "caseSensitive" | "wholeWord">): RegExp | undefined {
  const text = find.trim();
  if (!text || text.length > MAX_FIND) return undefined;
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])` : escaped, caseSensitive ? "gu" : "giu");
}

/** The texts that contain what to find, with the text split around each hit before and after the change. */
export function findMatches(rows: { row: Row; section: Section }[], input: ReplaceInput): Match[] {
  const re = findPattern(input);
  if (!re) return [];
  const out: Match[] = [];
  for (const { row, section } of rows) {
    const value = row.value;
    const before: Part[] = [], after: Part[] = [];
    let last = 0, hits = 0;
    for (const m of value.matchAll(re)) {
      if (!m[0]) continue;
      hits++;
      const at = m.index ?? 0;
      if (at > last) { before.push({ text: value.slice(last, at), hit: false }); after.push({ text: value.slice(last, at), hit: false }); }
      before.push({ text: m[0], hit: true });
      if (input.replace) after.push({ text: input.replace, hit: true });
      last = at + m[0].length;
    }
    if (!hits) continue;
    if (last < value.length) { before.push({ text: value.slice(last), hit: false }); after.push({ text: value.slice(last), hit: false }); }
    out.push({ key: row.key, label: row.label, section: section.title, before, after, next: input.replace ? after.map((p) => p.text).join("") : after.map((p) => p.text).join("").replace(/[ \t]{2,}/g, " ").trim() });
  }
  return out;
}
