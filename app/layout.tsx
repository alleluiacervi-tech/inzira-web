import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { LocaleProvider } from "@/components/I18n";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { siteOrigin } from "@/lib/site";
import "./globals.css";
import "./public.css";

// Fonts are downloaded at build time and served from our own domain: no request to Google when a
// page loads, which matters on slow mobile connections.
// One family for everything: Hanken Grotesk, with the weight and size doing the hierarchy.
const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--f-sans", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: { default: text(locale, "meta.title"), template: "%s · Inzira" },
    description: text(locale, "meta.description"),
    metadataBase: new URL(siteOrigin() ?? "http://localhost:3000"),
    openGraph: { siteName: "Inzira", type: "website", locale: locale === "rw" ? "rw_RW" : "en_RW" },
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
