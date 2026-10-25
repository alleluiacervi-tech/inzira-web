import type { Metadata } from "next";
import type { Locale } from "./i18n/locale";

/** Drop a leading /en so one path is the Kinyarwanda address and /en is the English address. */
export function barePath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || "/";
  const stripped = path.replace(/^\/en(?=\/|$)/, "");
  return stripped === "" ? "/" : stripped;
}

const UNPREFIXED = /^\/(portal|console|admin|api|files|sign-in|r)(\/|$)/;

/** Signed-in areas and the sign-in page stay off the public index. */
export function isIndexable(pathname: string): boolean {
  return !UNPREFIXED.test(barePath(pathname));
}

/**
 * Keep an English visitor on /en, and a Kinyarwanda visitor on the unprefixed path.
 * Hashes and query strings stay. Private pages are never prefixed.
 */
export function withLocale(locale: Locale, href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const before = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const qAt = before.indexOf("?");
  const path = qAt >= 0 ? before.slice(0, qAt) : before;
  const search = qAt >= 0 ? before.slice(qAt) : "";
  const bare = barePath(path);
  if (locale !== "en" || UNPREFIXED.test(bare)) return `${bare}${search}${hash}`;
  const prefixed = bare === "/" ? "/en" : `/en${bare}`;
  return `${prefixed}${search}${hash}`;
}

/** Canonical and hreflang for one public path. English is /en; Kinyarwanda is unprefixed. */
export function languageAlternates(origin: string, pathname: string, locale: Locale): NonNullable<Metadata["alternates"]> {
  const [path, search] = pathname.split("?");
  const bare = barePath(path || "/");
  const query = search ? `?${search}` : "";
  const rwPath = `${bare === "/" ? "/" : bare}${query}`;
  const enPath = `${bare === "/" ? "/en" : `/en${bare}`}${query}`;
  return {
    canonical: origin + (locale === "en" ? enPath : rwPath),
    languages: {
      en: origin + enPath,
      rw: origin + rwPath,
      "x-default": origin + rwPath,
    },
  };
}
