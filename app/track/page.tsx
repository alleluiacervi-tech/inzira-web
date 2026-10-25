import type { Metadata } from "next";
import Link from "next/link";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import Track from "@/components/Track";
import { Icon } from "@/components/ui";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { heldRefs } from "@/lib/request-links";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: text(locale, "meta.trackTitle"), description: text(locale, "meta.trackDescription") };
}

export default async function TrackPage() {
  const [locale, recent] = await Promise.all([getLocale(), heldRefs()]);
  return (
    <>
      <PublicNav />
      <main id="main" className="wrap auth-main">
        <div className="auth-card stack g24">
          {/* Requests sent from this browser open straight away: it keeps their private links. */}
          {recent.length > 0 && (
            <nav className="stack g10" aria-label={text(locale, "link.recent")} data-recent>
              <span className="eb" style={{ fontSize: 11 }}>{text(locale, "link.recent")}</span>
              {recent.map((ref) => <Link key={ref} className="btn btn-s" href={`/r/${ref}`} style={{ justifyContent: "space-between" }}><span className="m">{ref}</span><Icon name="right" size={18} /></Link>)}
            </nav>
          )}
          <Track />
        </div>
      </main>
      <Footer />
    </>
  );
}
