import type { Metadata } from "next";
import type { Locale } from "./i18n/locale";
import { isIndexable, languageAlternates } from "./seo";
import { publicSearchEnabled } from "./search-policy";
import { SITE, siteOrigin } from "./site";

/** Keep snippets factual and readable even when an administrator supplies a long summary. */
export function snippet(...parts: string[]): string {
  const clean = parts.map(part => part.replace(/\s+/g, " ").trim()).filter(Boolean);
  let value = clean[0] ?? "";
  if (value.length <= 170) {
    for (const part of clean.slice(1)) {
      if (`${value} ${part}`.length > 170) break;
      value += ` ${part}`;
    }
    return value;
  }
  const complete = value.slice(0, 170).match(/^[\s\S]{50,}[.!?](?=\s|$)/)?.[0];
  if (complete) return complete;
  return `${value.slice(0, 169).replace(/\s+\S*$/, "").replace(/[.,;:!?]+$/, "")}…`;
}

export function searchRobots(path: string, index = true): NonNullable<Metadata["robots"]> {
  const publicPage = isIndexable(path);
  const enabled = publicSearchEnabled();
  return { index: enabled && publicPage && index, follow: enabled && publicPage, ...(enabled && publicPage ? { "max-image-preview": "large" as const } : {}) };
}

export function publicMetadata({ title, description, path, locale, absolute = false, index = true }: {
  title: string; description: string; path: string; locale: Locale; absolute?: boolean; index?: boolean;
}): Metadata {
  const origin = siteOrigin();
  const alternates = origin ? languageAlternates(origin, path, locale) : undefined;
  const socialTitle = absolute ? title : `${title} · ${SITE.name}`;
  const copy = snippet(description);
  return {
    title: absolute ? { absolute: title } : title,
    description: copy,
    robots: searchRobots(path, index),
    ...(alternates ? { alternates } : {}),
    openGraph: { title: socialTitle, description: copy, siteName: SITE.name, type: "website", locale: locale === "en" ? "en_RW" : "rw_RW", alternateLocale: [locale === "en" ? "rw_RW" : "en_RW"], images: [{ url: `${origin}/opengraph-image`, width: 1200, height: 630, alt: "Inzira — paperwork assistance services in Rwanda" }], ...(typeof alternates?.canonical === "string" ? { url: alternates.canonical } : {}) },
    twitter: { card: "summary_large_image", title: socialTitle, description: copy, images: [`${origin}/opengraph-image`] },
  };
}
