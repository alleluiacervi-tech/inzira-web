import Link from "next/link";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { Icon } from "@/components/ui";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";

export default async function NotFound() {
  const locale = await getLocale();
  const t = (path: string) => text(locale, path);
  const popular = [[t("notFound.company"), "/services/company-registration"], [t("notFound.licence"), "/services/trading-licence-declaration"], [t("notFound.etitle"), "/services/e-title"], [t("notFound.ebm"), "/services/ebm-installation"]];
  return (
    <>
      <PublicNav />
      <main id="main" className="wrap stack g24" style={{ paddingTop: "clamp(48px, 9vw, 96px)", paddingBottom: 96, maxWidth: 820, marginLeft: 0 }}>
        <div className="stack g12">
          <span className="eb">{t("notFound.kicker")}</span>
          <h1 className="d h-1">{t("notFound.title")}</h1>
          <p className="lead" style={{ maxWidth: 600 }}>{t("notFound.lead")}</p>
        </div>
        <form action="/services" className="card searchbox" style={{ maxWidth: 600 }} role="search">
          <Icon name="search" size={22} />
          <label htmlFor="nf-q" className="sr-only">{t("notFound.search")}</label>
          <input id="nf-q" name="q" placeholder={t("notFound.ph")} />
          <button className="btn btn-p" type="submit">{t("notFound.go")}</button>
        </form>
        <div className="row g8 wrapx"><span className="mut" style={{ fontSize: 14 }}>{t("notFound.popular")}</span>{popular.map(([l, h]) => <Link key={h} className="tag" href={h}>{l}</Link>)}</div>
        <div className="row g12 wrapx" style={{ paddingTop: 8 }}>
          <Link className="btn btn-s" href="/track"><Icon name="search" size={18} /> {t("notFound.track")}</Link>
          <Link className="btn btn-g" href="/">{t("notFound.home")}</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
