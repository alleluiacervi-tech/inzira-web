import en from "./en.json";
import rw from "./rw.json";
import type { Locale } from "./locale";

export type Messages = typeof en;

const bundles: Record<Locale, Messages> = { en, rw: rw as Messages };

function dig(bag: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[key] : undefined), bag);
}

/** Replace `{name}` placeholders. Missing Kinyarwanda falls back to English. */
export function fill(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (vars[key] === undefined ? `{${key}}` : String(vars[key])));
}

export function text(locale: Locale, path: string, vars?: Record<string, string | number>) {
  const local = dig(bundles[locale], path);
  const value = typeof local === "string" && local.trim() ? local : dig(bundles.en, path);
  return fill(typeof value === "string" ? value : path, vars);
}

export function messages(locale: Locale): Messages {
  return bundles[locale];
}
