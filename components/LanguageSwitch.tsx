"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/app/actions/locale";
import type { Locale } from "@/lib/i18n/locale";
import { useI18n } from "./I18n";

/** EN / RW. The choice is stored in a cookie and the page is rendered again on the server. */
export function LanguageSwitch({ names = false }: { names?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (next: Locale) => {
    if (next === locale || pending) return;
    start(async () => {
      await setLocale(next);
      router.refresh();
    });
  };
  const items: { code: Locale; short: string; name: string }[] = [
    { code: "rw", short: "RW", name: t("nav.kinyarwanda") },
    { code: "en", short: "EN", name: t("nav.english") },
  ];
  return (
    <div className="row" role="group" aria-label={t("nav.language")} style={{ gap: names ? 8 : 2, justifyContent: names ? "center" : undefined }}>
      {items.map((it) => (
        <button key={it.code} type="button" className="btn btn-g btn-sm" disabled={pending} aria-pressed={locale === it.code} onClick={() => pick(it.code)}
          style={{ padding: names ? undefined : "0 6px", color: locale === it.code ? (names ? "var(--ember-deep)" : "var(--ink)") : "var(--muted)", fontWeight: locale === it.code ? 700 : 500 }}>
          {names ? it.name : it.short}
        </button>
      ))}
    </div>
  );
}
