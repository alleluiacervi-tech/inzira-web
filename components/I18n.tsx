"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n/locale";
import { text, type Messages, messages } from "@/lib/i18n/messages";

type Bag = { locale: Locale; m: Messages; t: (path: string, vars?: Record<string, string | number>) => string };

const Ctx = createContext<Bag | null>(null);

/** Provides the language for client screens. Dashboard layouts pass English. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<Bag>(() => ({ locale, m: messages(locale), t: (path, vars) => text(locale, path, vars) }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function ForceEnglish({ children }: { children: ReactNode }) {
  return <LocaleProvider locale="en">{children}</LocaleProvider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) return { locale: "rw" as Locale, m: messages("rw"), t: (path: string, vars?: Record<string, string | number>) => text("rw", path, vars) };
  return ctx;
}
