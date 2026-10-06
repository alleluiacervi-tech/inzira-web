import type { Metadata, Viewport } from "next";
import { Public_Sans, Source_Serif_4 } from "next/font/google";
import { LocaleProvider } from "@/components/I18n";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { siteOrigin } from "@/lib/site";
import "./globals.css";

// Fonts are downloaded at build time and served from our own domain: no request to Google when a
// page loads, which matters on slow mobile connections.
// Public Sans for everything people read and use; Source Serif 4 only for public page headlines.
const sans = Public_Sans({ subsets: ["latin"], variable: "--f-sans", display: "swap" });
// Not preloaded: only public headlines use it, so staff and portal pages never download it.
const serif = Source_Serif_4({ subsets: ["latin"], axes: ["opsz"], variable: "--f-serif", display: "swap", preload: false });

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
    <html lang={locale} className={`${sans.variable} ${serif.variable}`}>
      <body><LocaleProvider locale={locale}>{children}</LocaleProvider></body>
    </html>
  );
}
