"use client";

import type { Locale } from "@/lib/i18n/locale";
import { useI18n } from "./I18n";

/** EN / RW. A plain form post to /api/locale, which stores the choice and reloads this page in it.
 *  A full reload, not a server action: the language changes the root layout (<html lang>) and every
 *  cached page, and an action's re-render could be left uncommitted when it raced the link prefetches. */
export function LanguageSwitch({ names = false }: { names?: boolean }) {
  const { locale, t } = useI18n();
  const items: { code: Locale; short: string; name: string }[] = [
    { code: "rw", short: "RW", name: t("nav.kinyarwanda") },
    { code: "en", short: "EN", name: t("nav.english") },
  ];
  return (
    <form method="post" action="/api/locale" className="row" role="group" aria-label={t("nav.language")} style={{ gap: names ? 8 : 2, justifyContent: names ? "center" : undefined }}
      onSubmit={(e) => {
        const back = e.currentTarget.elements.namedItem("back");
        if (back instanceof HTMLInputElement) back.value = location.pathname + location.search + location.hash;
      }}>
      <input type="hidden" name="back" defaultValue="" />
      {items.map((it) => (
        <button key={it.code} type="submit" name="locale" value={it.code} className="btn btn-g btn-sm" aria-pressed={locale === it.code}
          style={{ padding: names ? undefined : "0 6px", color: locale === it.code ? (names ? "var(--ember-deep)" : "var(--ink)") : "var(--muted)", fontWeight: locale === it.code ? 700 : 500 }}>
          {names ? it.name : it.short}
        </button>
      ))}
    </form>
  );
}
