// The strings of one service, as the service editor and the Kinyarwanda editor list them. No JSON and no database, so the
// browser can use it. A string is addressed by its path inside the service ("steps.2.title"); lib/content-fields.ts turns
// that into the key it is stored under ("cat:services.<slug>.steps.2.title").
import { shortTime } from "./format";
import type { Service } from "./types";

export const words = (segment: string) => {
  const spaced = segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
export const long = (text: string) => text.length > 80 || text.includes("\n");
/** Every {name} in a text, once, in order. */
export const variablesOf = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];

const CAT = "cat:";

export type Field = {
  /** The key it is stored under. */
  key: string;
  /** Where the string sits, e.g. "Hero › Title" or "Step 3 › Title". */
  label: string;
  /** The English the Kinyarwanda is written from. */
  en: string;
  /** Long enough to need a larger box. */
  long: boolean;
};

/** What the editor needs to know of a service: its current English. */
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

/** The path of a field inside its service ("steps.2.title"). */
export const pathInService = (f: Field) => f.key.split(".").slice(2).join(".");

/** Kinyarwanda by path inside one service, as the service editor holds it. */
export type ServiceRw = Record<string, string>;

/**
 * Takes item `removed` out of a list ("documents", "requirements") in a ServiceRw: its lines go, and the lines after it
 * move up, so the Kinyarwanda stays with the same item when the English list loses one.
 */
export function shiftList(rw: ServiceRw, list: string, removed: number): ServiceRw {
  const out: ServiceRw = {};
  for (const [path, text] of Object.entries(rw)) {
    const m = new RegExp(`^${list}\\.(\\d+)(\\..+)?$`).exec(path);
    if (!m) { out[path] = text; continue; }
    const at = Number(m[1]);
    if (at === removed) continue;
    out[at > removed ? `${list}.${at - 1}${m[2] ?? ""}` : path] = text;
  }
  return out;
}

/** The six steps a new service starts with (English). */
export const defaultSteps = (channel: string, authority: string): Service["steps"] => [
  { title: "You start the request", body: "Answer a few short questions. Takes about 3 minutes.", you: true },
  { title: "We check your documents", body: "Your agent confirms everything is correct, usually within 2 working hours." },
  { title: "You approve the fees", body: "You see the official fee and our fee separately, then pay by MoMo or Airtel Money.", you: true },
  { title: `We submit via ${channel}`, body: "We submit through the official channel and share the official reference number with you." },
  { title: `${authority} processes it`, body: "The institution reviews and decides. We follow up if it takes longer than usual." },
  { title: "You receive the result", body: "Delivered to your portal, with official receipts." },
];

/** The same six steps in Kinyarwanda, the wording the catalogue already uses. */
export const defaultStepsRw = (channel: string, authority: string): ServiceRw => ({
  "steps.0.title": "Utangira ubusabe", "steps.0.body": "Subiza ibibazo bike byoroshye. Bitwara nk'iminota 3 gusa.",
  "steps.1.title": "Dusuzuma inyandiko zawe", "steps.1.body": "Umuhagarikizi wawe asuzuma ko byose byujuje ibyangombwa, ubusanzwe mu masaha 2 y'akazi.",
  "steps.2.title": "Wemeza amafaranga yo kwishyura", "steps.2.body": "Ubona amafaranga y'urwego n'ay'ubufasha bwacu bitandukanye, hanyuma ukishyura ukoresheje MoMo cyangwa Airtel Money.",
  "steps.3.title": `Tubyohereza kuri ${channel}`, "steps.3.body": "Tubyohereza binyuze mu nzira yemewe tukaguha numero y'ubusabe yo gukurikirana.",
  "steps.4.title": `${authority} irabisuzuma`, "steps.4.body": "Urwego rubisuzuma rukafata icyemezo. Iyo bitinze kurenza bisanzwe turabikurikirana.",
  "steps.5.title": "Uhabwa igisubizo", "steps.5.body": "Ucyakira kuri konte yawe yo kuri Inzira no kuri WhatsApp, hamwe n'inyemezabwishyu z'urwego.",
});
