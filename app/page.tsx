import Link from "next/link";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { Alert, Icon } from "@/components/ui";
import { listCategories, listServices } from "@/lib/repo";
import { OFFICES } from "@/lib/institutions";
import { rwf } from "@/lib/format";
import { SITE } from "@/lib/site";
import { ContactList } from "@/components/Contact";
import { PriceList } from "@/components/PriceList";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { localizeCategory, localizeServices, officeText } from "@/lib/i18n/present";

type T = (path: string, vars?: Record<string, string | number>) => string;

/** A made-up request, labelled as an example, showing what following a request looks like. */
function CaseFile({ t }: { t: T }) {
  const steps: { title: string; meta: string; state: "done" | "now" | "next" }[] = [
    { title: t("home.step1t"), meta: t("home.step1m"), state: "done" },
    { title: t("home.step2t"), meta: t("home.step2m"), state: "done" },
    { title: t("home.step3t"), meta: t("home.step3m"), state: "now" },
    { title: t("home.step4t"), meta: t("home.step4m"), state: "next" },
  ];
  return (
    <figure className="case" aria-label={t("home.caseLabel")}>
      <div className="case-tab fig">{t("home.caseTab")}</div>
      <div className="case-sheet">
        <header className="case-head">
          <span className="case-ex">{t("home.example")}</span>
          <strong className="case-title">{t("home.caseTitle")}</strong>
          <span className="case-sub">Umucyo Tech Ltd</span>
        </header>
        <ol className="case-steps">
          {steps.map((s) => (
            <li key={s.title} className={`case-step is-${s.state}`} aria-current={s.state === "now" ? "step" : undefined}>
              <span className="case-dot" aria-hidden="true">{s.state === "done" && <Icon name="check" size={12} stroke={3} />}</span>
              <span className="stack" style={{ gap: 2 }}>
                <strong className="case-step-t">{s.title}{s.state === "now" && <span className="sr-only">{t("home.caseCurrent")}</span>}</strong>
                <span className="case-meta">{s.meta}</span>
              </span>
            </li>
          ))}
        </ol>
        <footer className="case-ref">
          <span className="stack" style={{ gap: 2 }}>
            <span className="case-meta">{t("home.caseRef")}</span>
            <strong className="fig">RDB-APP-778120</strong>
          </span>
          <span className="case-filed"><Icon name="check" size={14} stroke={2.6} />{t("home.caseFiled")}</span>
        </footer>
      </div>
    </figure>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const deleted = (await searchParams).account === "deleted";
  const locale = await getLocale();
  const t: T = (path, vars) => text(locale, path, vars);
  const [rawServices, rawCategories] = await Promise.all([listServices(), listCategories()]);
  const services = localizeServices(rawServices, locale);
  const categories = rawCategories.map((c) => localizeCategory(c, locale));
  const popular = services.filter((s) => s.popular).slice(0, 4);
  const steps = [["home.s1t", "home.s1d"], ["home.s2t", "home.s2d"], ["home.s3t", "home.s3d"], ["home.s4t", "home.s4d"]];
  const faqs = [
    ["home.q1", t("home.a1", { legal: SITE.legalName, city: SITE.city })],
    ["home.q2", t("home.a2")],
    ["home.q3", t("home.a3")],
    ["home.q4", t("home.a4")],
    ["home.q5", t("home.a5")],
  ] as const;

  // For each category, how many services it holds and the lowest fee of ours among them.
  const browse = categories.map((c) => {
    const list = services.filter((s) => s.category === c.id);
    return { c, count: list.length, from: list.length ? Math.min(...list.map((s) => s.ours)) : null };
  }).filter((b) => b.c.href || b.count > 0);

  return (
    <>
      <PublicNav />
      <main id="main" className="home">
        {deleted && <div className="wrap" style={{ paddingTop: 20, paddingBottom: 20 }}><Alert kind="ok" title={t("home.deletedTitle")} live>{t("home.deletedBody")}</Alert></div>}

        <section className="top" aria-labelledby="hero-h">
          <div className="wrap top-grid">
            <div className="top-copy">
              <h1 id="hero-h" className="h-hero">{t("home.hero")}</h1>
              <p className="top-lead">{t("home.lead")}</p>
              <form className="hero-search" role="search" action="/services" method="get">
                <label htmlFor="hero-q" className="hero-search-label">{t("home.searchLabel")}</label>
                <div className="hero-search-box">
                  <Icon name="search" size={22} />
                  <input id="hero-q" name="q" type="search" placeholder={t("home.searchPh")} autoComplete="off" enterKeyHint="search" />
                  <button className="btn btn-p btn-lg" type="submit">{t("home.searchBtn")}</button>
                </div>
              </form>
              {popular.length > 0 && (
                <div className="hero-popular">
                  <span>{t("home.popular")}</span>
                  <ul>{popular.map((s) => <li key={s.slug}><Link href={`/services/${s.slug}`}>{s.name}</Link></li>)}</ul>
                </div>
              )}
              <ul className="top-facts">
                <li><Icon name="clock" size={18} />{t("home.reply", { time: t("responseTime") })}</li>
                <li><Icon name="file-text" size={18} />{t("home.receipts")}</li>
                <li><Icon name="phone" size={18} />{t("home.momo")}</li>
              </ul>
            </div>
            <CaseFile t={t} />
          </div>
          <div className="wrap">
            <div className="filed">
              <span className="filed-label">{t("home.filedWith")}</span>
              <ul className="filed-list">
                {OFFICES.map((o) => <li key={o.code}><abbr title={officeText(o.code, locale)?.name ?? o.name}>{o.code}</abbr></li>)}
              </ul>
              <span className="filed-note">{t("home.filedNote")}</span>
            </div>
          </div>
          <div className="imigongo" aria-hidden="true" />
        </section>

        <section id="services" className="sec" aria-labelledby="browse-h">
          <div className="wrap stack g32">
            <div className="sec-head">
              <div className="stack g12">
                <h2 id="browse-h" className="h-2">{t("home.browseTitle")}</h2>
                <p className="sec-lead">{t("home.browseLead")}</p>
              </div>
              <Link className="btn btn-s" href="/services">{t("home.viewAll")}<Icon name="arrow" size={16} /></Link>
            </div>
            <ul className="cats">
              {browse.map(({ c, count, from }) => (
                <li key={c.id}>
                  <Link className={`cat${c.href ? " cat-alt" : ""}`} href={c.href ?? `/services?category=${c.id}`}>
                    <span className="cat-ico"><Icon name={c.icon} size={26} /></span>
                    <span className="cat-name">{c.name}</span>
                    <span className="cat-desc">{c.desc}</span>
                    <span className="cat-meta">
                      {c.href ? <span>{t("home.notListed")}</span> : <><span>{count === 1 ? t("home.oneService") : t("home.nServices", { n: count })}</span>{from !== null && <strong className="fig">{t("home.from", { amount: rwf(from) })}</strong>}</>}
                      <Icon name="arrow" size={18} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="prices" className="sec sec-tint" aria-labelledby="two-h">
          <div className="wrap two-fees">
            <div className="stack g12">
              <h2 id="two-h" className="h-2">{t("home.twoTitle")}</h2>
              <p className="sec-lead">{t("home.twoLead")}</p>
            </div>
            <div className="fee-pair">
              <div className="fee-card fee-card-official">
                <span className="fo">{t("feeTag.official")}</span>
                <h3>{t("home.twoOfficialT")}</h3>
                <p>{t("home.twoOfficialD")}</p>
              </div>
              <div className="fee-card fee-card-ours">
                <span className="fs">{t("feeTag.ours")}</span>
                <h3>{t("home.twoOursT")}</h3>
                <p>{t("home.twoOursD")}</p>
              </div>
            </div>
            <details className="fee-all">
              <summary>{t("home.feesTitle")}<span className="chev"><Icon name="down" size={20} /></span></summary>
              <div className="stack g24" style={{ paddingTop: 8 }}>
                <p className="sec-lead">{t("home.feesLead")}</p>
                <PriceList services={services} />
              </div>
            </details>
          </div>
        </section>

        <section id="how" className="sec" aria-labelledby="how-h">
          <div className="wrap stack g40">
            <div className="stack g12" style={{ maxWidth: 620 }}>
              <h2 id="how-h" className="h-2">{t("home.howTitle")}</h2>
              <p className="sec-lead">{t("home.howLead")}</p>
            </div>
            <ol className="steps4">
              {steps.map(([title, body], i) => (
                <li key={title}>
                  <span className="steps4-mark"><span className="steps4-n">{i + 1}</span>{i < steps.length - 1 && <span className="steps4-line" aria-hidden="true" />}</span>
                  <h3 className="steps4-t">{t(title)}</h3>
                  <p className="steps4-d">{t(body)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="help" className="sec sec-tint" aria-labelledby="faq-h">
          <div className="wrap two-col">
            <div className="stack g12"><h2 id="faq-h" className="h-2">{t("home.faqTitle")}</h2><p className="sec-lead">{t("home.faqLead")} <Link href="#talk">{t("home.faqTalk")}</Link>. {t("home.faqFree")}</p></div>
            <div className="faq">
              {faqs.map(([q, a]) => (
                <details key={q}>
                  <summary>{t(q)}<span className="chev"><Icon name="down" size={20} /></span></summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="talk" className="close" aria-labelledby="cta-h">
          <div className="wrap close-grid">
            <div className="stack g20">
              <h2 id="cta-h" className="h-2">{t("home.closeTitle")}</h2>
              <p className="sec-lead">{t("home.closeLead")}</p>
              <div className="close-ctas">
                <Link className="btn btn-p btn-lg" href="/services">{t("home.start")}</Link>
                <Link className="btn btn-s btn-lg" href="/start">{t("home.notListed")}</Link>
              </div>
            </div>
            <div className="contact-card">
              <ContactList />
              <p className="contact-hours"><Icon name="clock" size={16} />{t("home.hours", { hours: t("hours"), time: t("responseTime") })}</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
