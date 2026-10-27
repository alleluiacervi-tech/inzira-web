// Sentences we store with the data: timeline events, portal notifications, a request's summary and
// next step, holds and closing reasons. They are stored as a message key and its values, and each
// reader gets them in their own language. The messages live under "stored" in en.json and rw.json;
// a message is one sentence, or several parts (title, body, detail, next) that belong together.
// The English sentence is stored in the row as well, so anything reading the tables directly, and
// rows written before messages existed, still read well. SMS texts live under "sms".
import { fmtDate, rwf } from "../format";
import type { Msg, MsgVars } from "../types";
import en from "./en.json";
import legacyRw from "./legacy-rw.json";
import { contentVersion } from "./live";
import type { Locale } from "./locale";
import { fill, messages, text } from "./messages";
import { channelName, displayDocName, methodName, serviceName } from "./present";

type Stored = typeof en.stored;
/** Every stored message, checked when the code is compiled: "group.name". */
export type StoredKey = { [G in keyof Stored]: `${G & string}.${keyof Stored[G] & string}` }[keyof Stored];
export type SmsKey = keyof typeof en.sms;
export type Part = "title" | "body" | "detail" | "next";

export const msg = (key: StoredKey, vars?: MsgVars): Msg => (vars ? { key, vars } : { key });
/** The values behind the official-fee phrase ("no official fee", "official RWF 12,000"…). */
export const feeVars = (mode: "none" | "direct" | null | undefined, official: number | null): MsgVars =>
  ({ officialMode: mode === "none" ? "none" : mode ? "direct" : "amount", official: rwf(official ?? 0) });
export const sms = (key: SmsKey, vars?: MsgVars): Msg => (vars ? { key, vars } : { key });

function template(locale: Locale, group: "stored" | "sms", key: string, part?: Part): string | undefined {
  let node: unknown = messages(locale)[group];
  for (const step of key.split(".")) node = node && typeof node === "object" ? (node as Record<string, unknown>)[step] : undefined;
  if (part) node = node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
  return typeof node === "string" && node.trim() ? node : undefined;
}

/** A stage label as the customer sees it ("With the institution" → "Mu rwego rwa leta"). */
const statusLabel = (locale: Locale, label: string) => {
  const local = text(locale, `status.${label}`);
  return local === `status.${label}` ? label : local;
};

/**
 * The values as this reader should see them. By convention a value named `service` is a catalogue
 * service name (with `serviceSlug`), `doc` a checklist document name, `stage` a stage label and
 * `channel` an official channel and `method` a payment method; those are translated. `officialMode` ("none", "direct" or "amount",
 * with `official`) becomes `officialText`, the official-fee phrase. Everything else (amounts,
 * references, names, someone's own words) is shown as stored.
 */
function localVars(locale: Locale, vars: MsgVars | undefined): MsgVars {
  if (!vars) return {};
  const out: MsgVars = { ...vars };
  // Messages written before email sign-in carry the phone number as `phone`; the sentence now says `contact`.
  if (out.contact === undefined && typeof out.phone === "string") out.contact = out.phone;
  if (vars.officialMode === "none" || vars.officialMode === "direct" || vars.officialMode === "amount") {
    const t = template(locale, "stored", `fee.${vars.officialMode}`) ?? template("en", "stored", `fee.${vars.officialMode}`);
    out.officialText = fill(t ?? "", { official: vars.official ?? "" });
  }
  if (locale === "en") return out;
  if (typeof vars.service === "string") out.service = serviceName(typeof vars.serviceSlug === "string" ? vars.serviceSlug : undefined, vars.service, locale);
  if (typeof vars.doc === "string") out.doc = displayDocName(vars.doc, locale);
  if (typeof vars.stage === "string") out.stage = statusLabel(locale, vars.stage);
  if (typeof vars.channel === "string") out.channel = channelName(vars.channel, locale);
  if (typeof vars.method === "string") out.method = methodName(vars.method, locale);
  return out;
}

/** The message (or one part of it) in this language, falling back to English; undefined if the
 *  message no longer exists, so the caller can show the English stored with the row. */
export function say(locale: Locale, m: Msg, part?: Part): string | undefined {
  const t = template(locale, "stored", m.key, part) ?? template("en", "stored", m.key, part);
  return t === undefined ? undefined : fill(t, localVars(locale, m.vars));
}

/** Whether the message has this part. A message with a `body` part never also carries someone's own
 *  words as its body, so readers know which one the stored body is. */
export const hasPart = (m: Msg, part: Part) => template("en", "stored", m.key, part) !== undefined;

/** The English sentence to store with the row. */
export function english(m: Msg, part?: Part): string {
  const t = say("en", m, part);
  if (t === undefined) console.error(`[i18n] missing stored message ${m.key}${part ? `.${part}` : ""}`);
  return t ?? m.key;
}

/**
 * Rows written before messages existed, and the demo data, hold English sentences only. In
 * Kinyarwanda they are looked up: first in legacy-rw.json, then among the messages that take no
 * values (so an old "Document approved" reads like a new one). Anything else stays as stored.
 */
let fixed: { version: string; map: Map<string, string> } | undefined;
function fixedRw(): Map<string, string> {
  const version = contentVersion();
  if (fixed?.version === version) return fixed.map;
  const map = new Map<string, string>();
  (function collect(enNode: unknown, rwNode: unknown) {
    if (typeof enNode === "string") {
      if (typeof rwNode === "string" && rwNode.trim() && !enNode.includes("{")) map.set(enNode, rwNode);
      return;
    }
    if (enNode && typeof enNode === "object") for (const [k, v] of Object.entries(enNode)) collect(v, (rwNode as Record<string, unknown> | undefined)?.[k]);
  })(en.stored, messages("rw").stored);
  for (const [k, v] of Object.entries(legacyRw as Record<string, string>)) map.set(k, v);
  fixed = { version, map };
  return map;
}

export function legacyText(locale: Locale, english: string): string;
export function legacyText(locale: Locale, english: string | undefined): string | undefined;
export function legacyText(locale: Locale, english: string | undefined) {
  if (!english || locale === "en") return english;
  return fixedRw().get(english) ?? english;
}

/** The note left on a checklist document whose file was deleted (lib/privacy.ts writes it in English
 *  for the staff screens), in this language. Other notes are someone's own words, shown as typed. */
export function documentNote(locale: Locale, note: string | undefined): string | undefined {
  if (!note || locale === "en") return note;
  const m = /^File deleted (.+) on (\d{4}-\d{2}-\d{2})\.$/.exec(note);
  if (!m) return legacyText(locale, note);
  const days = /^(\d+) days after the request finished$/.exec(m[1]);
  const key = m[1] === "at the customer’s request" || m[1] === "at the customer's request" ? "docNote.deletedCustomer"
    : days ? "docNote.deletedRetention" : m[1] === "when the customer deleted their account" ? "docNote.deletedAccount"
    : m[1] === "when the unpaid request was closed" ? "docNote.deletedUnpaid" : null;
  return key ? say(locale, { key, vars: { date: fmtDate(`${m[2]}T12:00:00Z`, locale), days: days?.[1] ?? "" } }) ?? note : note;
}

/** An SMS in this language, falling back to English. */
export function smsText(locale: Locale, m: Msg): string {
  const t = template(locale, "sms", m.key) ?? template("en", "sms", m.key);
  if (t === undefined) console.error(`[i18n] missing SMS ${m.key}`);
  return fill(t ?? m.key, localVars(locale, m.vars));
}
