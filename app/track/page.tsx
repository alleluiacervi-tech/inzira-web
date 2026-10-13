import type { Metadata } from "next";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import Track from "@/components/Track";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: text(locale, "meta.trackTitle"), description: text(locale, "meta.trackDescription") };
}

export default function TrackPage() {
  return (
    <>
      <PublicNav />
      <main id="main" className="wrap auth-main">
        <div className="auth-card"><Track /></div>
      </main>
      <Footer />
    </>
  );
}
