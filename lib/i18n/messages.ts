import en from "./en.json";
import { liveRw } from "./live";
import type { Locale } from "./locale";

export type Messages = typeof en;

/** English is the text in en.json. Kinyarwanda is rw.json with the edits made in the admin console laid over it (./live.ts). */
const bundle = (locale: Locale): Messages => (locale === "rw" ? (liveRw() as Messages) : en);

function dig(bag: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[key] : undefined), bag);
}

/** Replace `{name}` placeholders. Missing Kinyarwanda falls back to English. */
export function fill(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (vars[key] === undefined ? `{${key}}` : String(vars[key])));
}

export function text(locale: Locale, path: string, vars?: Record<string, string | number>) {
  const local = dig(bundle(locale), path);
  const value = typeof local === "string" && local.trim() ? local : dig(en, path);
  return fill(typeof value === "string" ? value : path, vars);
}

export function messages(locale: Locale): Messages {
  return bundle(locale);
}
