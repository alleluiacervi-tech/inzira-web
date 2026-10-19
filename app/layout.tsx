import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Hanken_Grotesk } from "next/font/google";
import { LocaleProvider } from "@/components/I18n";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { isIndexable, languageAlternates } from "@/lib/seo";
import { siteOrigin } from "@/lib/site";
import "./globals.css";
import "./public.css";

// Fonts are downloaded at build time and served from our own domain: no request to Google when a
// page loads, which matters on slow mobile connections.
// One family for everything: Hanken Grotesk, with the weight and size doing the hierarchy.
const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--f-sans", display: "swap" });

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
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      siteName: "Inzira",
      type: "website",
      locale: locale === "rw" ? "rw_RW" : "en_RW",
      alternateLocale: locale === "rw" ? ["en_RW"] : ["rw_RW"],
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
  return (
    <html lang={locale} className={sans.variable}>
      <body><LocaleProvider locale={locale}>{children}</LocaleProvider></body>
    </html>
  );
}
