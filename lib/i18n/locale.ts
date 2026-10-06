import { cookies } from "next/headers";

export const LANG_COOKIE = "inzira_lang";
export type Locale = "en" | "rw";

/** Kinyarwanda is the default. English is only used when the visitor chose it. */
export function asLocale(value: string | undefined | null): Locale {
  return value === "en" ? "en" : "rw";
}

/** Customer portal and staff dashboards stay English, whatever the public site is showing. */
export const DASHBOARD_LOCALE: Locale = "en";

/** Language chosen on the public site. Dashboards do not read this. */
export async function getLocale(): Promise<Locale> {
  return asLocale((await cookies()).get(LANG_COOKIE)?.value);
}
