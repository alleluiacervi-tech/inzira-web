import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import ContentBridge from "@/components/ContentBridge";
import { LocaleProvider } from "@/components/I18n";
import { NavCategoriesProvider } from "@/components/NavCategories";
import { contentEntries } from "@/lib/content";
import { contentVersion } from "@/lib/i18n/live";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { navCategories } from "@/lib/nav-categories";
import { isIndexable, languageAlternates } from "@/lib/seo";
import { siteOrigin } from "@/lib/site";
import { isDemo } from "@/lib/sms";
import { searchRobots } from "@/lib/public-metadata";
import { brandGraph } from "@/lib/brand-schema";
import { JsonLd } from "@/components/JsonLd";
import "./globals.css";
import "./public.css";
import "./design-refresh.css";

// Vendored under the SIL Open Font License: builds and page loads need no font service.
const sans = localFont({ src: "./fonts/hanken-grotesk-latin.woff2", weight: "100 900", variable: "--f-sans", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const pathname = ((await headers()).get("x-inzira-path") ?? "/").split("?")[0] || "/";
  const origin = siteOrigin();
  const indexable = isIndexable(pathname);
  const alternates = origin && indexable ? languageAlternates(origin, pathname, locale) : undefined;
  return {
    title: { default: text(locale, "meta.title"), template: "%s · Inzira" },
    description: text(locale, "meta.description"),
    metadataBase: new URL(origin ?? "http://localhost:3000"),
    alternates,
    robots: searchRobots(pathname),
    ...(process.env.GOOGLE_SITE_VERIFICATION?.trim() ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION.trim() } } : {}),
    openGraph: {
      title: text(locale, "meta.title"),
      description: text(locale, "meta.description"),
      siteName: "Inzira",
      type: "website",
      locale: locale === "rw" ? "rw_RW" : "en_RW",
      alternateLocale: locale === "rw" ? ["en_RW"] : ["rw_RW"],
      images: [{ url: `${origin}/opengraph-image`, width: 1200, height: 630, alt: "Inzira — paperwork assistance services in Rwanda" }],
      ...(typeof alternates?.canonical === "string" ? { url: alternates.canonical } : {}),
    },
    twitter: { card: "summary_large_image" },
  };
}
// Every page reads live data (prices, requests), so nothing is frozen at build time.
export const dynamic = "force-dynamic";
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const menu = await navCategories(locale);
  const pathname = (await headers()).get("x-inzira-path") ?? "/";
  const origin = siteOrigin();
  return (
    <html lang={locale} className={sans.variable}>
      <body>
        {origin && isIndexable(pathname) && <JsonLd data={{ "@context": "https://schema.org", "@graph": brandGraph(origin, text(locale, "meta.description")) }} />}
        <ContentBridge entries={locale === "rw" ? contentEntries() : {}} version={locale === "rw" ? contentVersion() : ""} />
        <LocaleProvider locale={locale}><NavCategoriesProvider categories={menu}>
          {isDemo() && <aside className="demo-notice" aria-label={text(locale, "demo.title")}><strong>{text(locale, "demo.title")}</strong><span>{text(locale, "demo.body")}</span></aside>}
          {children}
        </NavCategoriesProvider></LocaleProvider>
      </body>
    </html>
  );
}
