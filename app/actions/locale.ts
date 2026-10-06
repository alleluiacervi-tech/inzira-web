"use server";

import { cookies } from "next/headers";
import { asLocale, LANG_COOKIE } from "@/lib/i18n/locale";

export async function setLocale(value: string) {
  const locale = asLocale(value);
  (await cookies()).set(LANG_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return locale;
}
