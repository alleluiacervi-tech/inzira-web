import type { Metadata } from "next";
import PublicNav from "@/components/PublicNav";
import { ClaimGate } from "@/components/RequestLink";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: text(await getLocale(), "link.saveTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** The "save to my account" link from an email: its secret is read in the browser (components/RequestLink.tsx). */
export default async function SaveRequestPage({ params }: { params: Promise<{ ref: string }> }) {
  const ref = decodeURIComponent((await params).ref).toUpperCase();
  return (
    <>
      <PublicNav />
      <main id="main" className="wrap auth-main"><div className="auth-card"><ClaimGate reqRef={ref} /></div></main>
    </>
  );
}
