// What can be edited in Admin › Kinyarwanda text, and how it is checked. No database: this is the list of strings the
// site has (from the English files and the services), grouped into the screens an administrator thinks in.
// A string is addressed by its key: "ui:<path in rw.json>" or "cat:<path in catalogue-rw.json>" (lib/i18n/live.ts).
import catalogueEn from "./i18n/catalogue-en.json";
import en from "./i18n/en.json";
import { CAT, UI, getPath, liveCatalogue, liveRw, shippedCatalogue, shippedRw } from "./i18n/live";
import { shortTime } from "./format";
import type { Service } from "./types";

export type Field = {
  key: string;
  /** Where the string sits, e.g. "Hero › Title" or "Step 3 › Title". */
  label: string;
  /** The English the Kinyarwanda is written from. */
  en: string;
  /** Long enough to need a larger box. */
  long: boolean;
};
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
  { id: "menu", title: "Menu, footer & page titles", hint: "The top menu, the footer, and the titles and descriptions shown in Google results and browser tabs.", preview: "/", keys: ["nav", "footer", "meta", "notFound", "error"] },
  { id: "about", title: "About page", hint: "Who Inzira is.", preview: "/about", keys: ["about"] },
  { id: "legal", title: "Privacy & terms", hint: "The privacy notice and the terms of service.", preview: "/privacy", keys: ["legal"] },
  { id: "services-pages", title: "Services pages", hint: "The labels on the services list and on every service page. The text of each service is under Services.", preview: "/services", keys: ["catalogue", "service", "prices", "price", "feeTag"] },
  { id: "start", title: "Starting a request", hint: "The form a customer fills in to start a request.", preview: "/services", keys: ["start", "link"] },
  { id: "sign-in", title: "Sign-in & codes", hint: "Customer sign-in, the codes people receive, and the errors they can meet.", preview: "/sign-in", keys: ["signIn", "code", "authErr", "custErr"] },
  { id: "track", title: "Track a request", hint: "The page where a customer looks up a request.", preview: "/track", keys: ["track"] },
  { id: "portal", title: "Customer account", hint: "What a signed-in customer sees: requests, documents and settings.", preview: "/portal", keys: ["portal", "shell", "portalBanner", "request", "teams", "status", "doc", "groups", "docs", "account", "dates", "side", "fileRoute"] },
  { id: "payment", title: "Payment", hint: "The payment screen and its messages.", preview: "/portal", keys: ["pay"] },
  { id: "updates", title: "Customer updates & emails", hint: "The lines on a request's timeline, notifications and emails. They are written once and shown in the reader's language.", preview: "/portal", keys: ["stored", "email"] },
];
const CATALOGUE_GROUPS: { id: string; title: string; hint: string; keys: ("categories" | "offices" | "units" | "officialPhrases")[] }[] = [
  { id: "categories", title: "Service categories", hint: "The names and descriptions of the categories on the home page and the services list.", keys: ["categories"] },
  { id: "offices", title: "Institutions", hint: "What each institution (RDB, RRA, NLA…) is and does.", keys: ["offices"] },
  { id: "fees", title: "Fee wording", hint: "Phrases such as “Official fee”, “To be confirmed” and the units after a price (“per year”).", keys: ["units", "officialPhrases"] },
];

const words = (segment: string) => {
  const spaced = segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
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
const long = (text: string) => text.length > 80 || text.includes("\n");
/** Every {name} in a text, once, in order. */
export const variablesOf = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];

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

/** The strings of one service, from its current English: a service added in the console gets its own. */
export type ServiceText = Pick<Service, "slug" | "name" | "aka" | "tagline" | "summary" | "authority" | "channel" | "via" | "time" | "docsShort" | "who" | "requirements" | "documents" | "steps" | "notes" | "official" | "purposes" | "purposeLabel" | "questions" | "feeOptions" | "feeOptionLabel" | "inPerson" | "stageLabels">;
export function serviceFields(s: ServiceText): Field[] {
  const base = ["services", s.slug];
  const out: Field[] = [];
  const add = (path: (string | number)[], label: string, text: string | undefined) => {
    if (text && text.trim()) out.push({ key: `${CAT}${[...base, ...path].join(".")}`, label, en: text, long: long(text) });
  };
  add(["name"], "Name", s.name);
  add(["aka"], "Also known as", s.aka);
  add(["tagline"], "Tagline", s.tagline);
  add(["summary"], "In simple terms", s.summary);
  add(["authority"], "Responsible authority", s.authority);
  add(["channel"], "Official channel", s.channel);
  add(["via"], "Submitted via", s.via);
  add(["time"], "How long it takes", s.time);
  add(["timeShort"], "How long (short)", shortTime(s.time));
  add(["docsShort"], "Documents (short)", s.docsShort);
  s.who.forEach((w, i) => { add(["who", i, "title"], `Who it’s for ${i + 1} › Title`, w.title); add(["who", i, "body"], `Who it’s for ${i + 1} › Text`, w.body); });
  s.requirements.forEach((r, i) => add(["requirements", i], `Requirement ${i + 1}`, r));
  s.documents.forEach((d, i) => { add(["documents", i, "name"], `Document ${i + 1} › Name`, d.name); add(["documents", i, "detail"], `Document ${i + 1} › Detail`, d.detail); });
  s.steps.forEach((st, i) => { add(["steps", i, "title"], `Step ${i + 1} › Title`, st.title); add(["steps", i, "body"], `Step ${i + 1} › Text`, st.body); });
  s.notes.forEach((n, i) => { add(["notes", i, "title"], `Note ${i + 1} › Title`, n.title); add(["notes", i, "body"], `Note ${i + 1} › Text`, n.body); });
  add(["officialNote"], "Official fee note", s.official.note);
  add(["inPerson"], "The step done in person", s.inPerson);
  add(["purposeLabel"], "Choice heading", s.purposeLabel);
  s.purposes?.forEach((p, i) => add(["purposes", i], `Choice ${i + 1}`, p));
  s.questions?.forEach((q, i) => {
    add(["questions", i, "label"], `Question ${i + 1} › Label`, q.label);
    add(["questions", i, "hint"], `Question ${i + 1} › Hint`, q.hint);
    add(["questions", i, "placeholder"], `Question ${i + 1} › Example`, q.placeholder);
  });
  add(["feeOptionLabel"], "Price choice heading", s.feeOptionLabel);
  s.feeOptions?.forEach((o, i) => add(["feeOptions", i], `Price choice ${i + 1}`, o.label));
  for (const [stage, label] of Object.entries(s.stageLabels ?? {})) add(["stageLabels", stage], `Stage › ${words(stage)}`, label);
  return out;
}

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
