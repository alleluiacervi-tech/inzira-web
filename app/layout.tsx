import type { Metadata, Viewport } from "next";
import { Public_Sans, Source_Serif_4 } from "next/font/google";
import { siteOrigin } from "@/lib/site";
import "./globals.css";

// Fonts are downloaded at build time and served from our own domain: no request to Google when a
// page loads, which matters on slow mobile connections.
// Public Sans for everything people read and use; Source Serif 4 only for public page headlines.
const sans = Public_Sans({ subsets: ["latin"], variable: "--f-sans", display: "swap" });
// Not preloaded: only public headlines use it, so staff and portal pages never download it.
const serif = Source_Serif_4({ subsets: ["latin"], axes: ["opsz"], variable: "--f-serif", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "Inzira — government paperwork, handled for you", template: "%s · Inzira" },
  description:
    "Independent professional help in Rwanda with RDB business registration, taxes, EBM, land services, RURA vehicle authorisations and Irembo. Not a government website.",
  // Lets shared links point at the absolute address of the preview image.
  metadataBase: new URL(siteOrigin() ?? "http://localhost:3000"),
  openGraph: { siteName: "Inzira", type: "website", locale: "en_RW" },
  twitter: { card: "summary_large_image" },
};
// Every page reads live data (prices, requests), so nothing is frozen at build time.
export const dynamic = "force-dynamic";
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
