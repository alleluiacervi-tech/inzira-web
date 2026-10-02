import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { siteOrigin } from "@/lib/site";
import "./globals.css";

// Fonts are downloaded at build time and served from our own domain: no request to Google when a
// page loads, which matters on slow mobile connections.
// Archivo with its width axis: wide for headlines, normal for text.
const sans = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--f-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Inzira — your paperwork, walked for you", template: "%s · Inzira" },
  description:
    "Independent professional help in Rwanda with RDB business registration, taxes, EBM, land services, RURA vehicle authorisations and Irembo. Not a government website.",
  // Lets shared links point at the absolute address of the preview image.
  metadataBase: new URL(siteOrigin() ?? "http://localhost:3000"),
  openGraph: { siteName: "Inzira", type: "website", locale: "en_RW" },
  twitter: { card: "summary_large_image" },
};
// Every page reads live data (prices, requests), so nothing is frozen at build time.
export const dynamic = "force-dynamic";
export const viewport: Viewport = { themeColor: "#fafbfc", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
