import { cookies, headers } from "next/headers";
import { primeContent } from "../content";
import { LANG_COOKIE } from "./cookie";

export { LANG_COOKIE };
export type Locale = "en" | "rw";

/** Kinyarwanda is the default. English is only used when the visitor chose it. */
export function asLocale(value: string | undefined | null): Locale {
  return value === "en" ? "en" : "rw";
}

/** Language chosen on the public site. A signed-in customer's portal follows their account instead
 *  (repo.getPortalLocale), and the two are kept in step when either changes. */
export async function getLocale(): Promise<Locale> {
  // Every page reads its text after asking for the language, so this is where the edits made in the admin console
  // (lib/content.ts) are loaded before any text is read.
  await primeContent();
  // /en is English for every visitor, including a crawler that does not send the language cookie.
  const fromPath = (await headers()).get("x-inzira-locale");
  if (fromPath === "en" || fromPath === "rw") return fromPath;
  return asLocale((await cookies()).get(LANG_COOKIE)?.value);
}

/** Remembers the language for the public site, for a year. */
export async function rememberLocale(locale: Locale) {
  (await cookies()).set(LANG_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
