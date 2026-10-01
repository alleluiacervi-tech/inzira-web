import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Fonts are downloaded at build time and served from our own domain: no request to Google when a
// page loads, which matters on slow mobile connections.
const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--f-display", display: "swap" });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--f-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--f-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Inzira — Government & business services, made easier", template: "%s · Inzira" },
  description:
    "Independent professional help in Rwanda with RDB business registration, taxes, EBM, land services, RURA vehicle authorisations and Irembo. Not a government website.",
};
// Every page reads live data (prices, requests), so nothing is frozen at build time.
export const dynamic = "force-dynamic";
export const viewport: Viewport = { themeColor: "#F6F4EF", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
