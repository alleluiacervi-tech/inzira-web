import Image from "next/image";
import Link from "next/link";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { Alert, Icon } from "@/components/ui";
import { listCategories, listServices } from "@/lib/repo";
import { officesFor } from "@/lib/institutions";
import { FilingRail } from "@/components/FilingRail";
import { isSet, SITE, siteOrigin } from "@/lib/site";
import { ContactList } from "@/components/Contact";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { JsonLd } from "@/components/JsonLd";
import { displayPrice, displayTime, localizeCategory, localizeServices, officeCopy } from "@/lib/i18n/present";
import { QuickSteps } from "@/components/QuickSteps";
import { withLocale } from "@/lib/seo";

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
  // Six requests people send most, with what they cost all in, so a visitor can start in one tap.
  const TOP = ["birth-certificate", "marriage-certificate", "criminal-record", "driving-licence-renewal", "company-registration", "trading-licence-declaration"];
  const popular = TOP.flatMap((slug) => services.filter((s) => s.slug === slug));
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
    return { c, count: list.length };
  }).filter((b) => b.c.href || b.count > 0);
  const browseById = new Map(browse.map((b) => [b.c.id, b]));
  // The categories an administrator features are cards. The others, and an unlisted service, sit on the line under them.
  const desks = browse.filter((b) => b.c.featured && !b.c.href);
  const more = browse.filter((b) => !(b.c.featured && !b.c.href));
  const offices = officesFor(categories);

  const origin = siteOrigin();
  const pageUrl = (path: string) => (origin ? origin + withLocale(locale, path) : undefined);
  return (
    <>
      {origin && (
        <JsonLd data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: SITE.name,
              legalName: SITE.legalName,
              url: origin,
              email: isSet(SITE.email) ? SITE.email : undefined,
              telephone: isSet(SITE.phone) ? SITE.phone : undefined,
              areaServed: { "@type": "Country", name: "Rwanda" },
              address: { "@type": "PostalAddress", addressLocality: SITE.city, addressCountry: "RW" },
            },
            {
              "@type": "WebSite",
              name: SITE.name,
              url: origin,
              inLanguage: locale === "en" ? "en" : "rw",
              publisher: { "@type": "Organization", name: SITE.legalName },
              potentialAction: { "@type": "SearchAction", target: `${pageUrl("/services")}?q={search_term_string}`, "query-input": "required name=search_term_string" },
            },
            {
              "@type": "FAQPage",
              mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: t(q), acceptedAnswer: { "@type": "Answer", text: a } })),
            },
          ],
        }} />
      )}
      <PublicNav />
      <main id="main" className="home">
        {deleted && <div className="wrap" style={{ paddingTop: 20, paddingBottom: 20 }}><Alert kind="ok" title={t("home.deletedTitle")} live>{t("home.deletedBody")}</Alert></div>}

        <section className="top" aria-labelledby="hero-h">
          <div className="wrap top-grid">
            <div className="top-copy">
              <h1 id="hero-h" className="h-hero">{t("home.hero")}</h1>
              <p className="top-lead">{t("home.lead")}</p>
              <form className="hero-search" role="search" action={withLocale(locale, "/services")} method="get">
                <label htmlFor="hero-q" className="hero-search-label">{t("home.searchLabel")}</label>
                <div className="hero-search-box">
                  <Icon name="search" size={22} />
                  <input id="hero-q" name="q" type="search" placeholder={t("home.searchPh")} autoComplete="off" enterKeyHint="search" />
                  <button className="btn btn-p btn-lg" type="submit">{t("home.searchBtn")}</button>
                </div>
              </form>
              <ul className="top-facts">
                <li><Icon name="clock" size={18} />{t("home.reply", { time: t("responseTime") })}</li>
                <li><Icon name="phone" size={18} />{t("home.momo")}</li>
                <li><Icon name="whatsapp" size={18} />{t("home.onWhatsapp")}</li>
              </ul>
            </div>
            <div className="hero-scene">
              <Image className="hero-city" src="/photos/kigali-centre.webp" alt="" fill priority sizes="(max-width: 1060px) 100vw, 48vw" />
              <div className="hero-scene-caption"><Icon name="pin" size={16} /><span>Kigali, Rwanda</span></div>
              <CaseFile t={t} />
            </div>
          </div>
          <div className="wrap">
            <FilingRail
              label={t("home.filedWith")}
              note={t("home.filedShort")}
              pause={t("home.filedPause")}
              play={t("home.filedPlay")}
              offices={offices.map((o) => ({
                code: o.code,
                name: officeCopy(o, locale).name,
                href: withLocale(locale, o.href),
                mark: o.mark,
                label: o.code === "CIV" ? t("home.filedCivil") : o.code === "RNP" ? "RNP" : o.mark ? null : officeCopy(o, locale).name,
              }))}
            />
          </div>
          <div className="wrap">
            <div className="pause" aria-hidden="true"><span></span></div>
          </div>
        </section>

        {popular.length > 0 && (
          <section className="sec sec-tight" aria-labelledby="pop-h">
            <div className="wrap stack g16">
              <h2 id="pop-h" className="h-3">{t("home.popular")}</h2>
              <ul className="pop">
                {popular.map((s) => {
                  const p = displayPrice(s, locale);
                  return (
                    <li key={s.slug}>
                      <Link href={withLocale(locale, `/services/${s.slug}`)}>
                        <strong className="pop-name">{s.name}</strong>
                        <span className="pop-meta"><strong className="fig">{p.amount}</strong>{p.note && <span> {p.note}</span>}</span>
                        <span className="pop-time"><Icon name="clock" size={14} />{displayTime(s, locale)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        <section id="services" className="sec" aria-labelledby="browse-h">
          <div className="wrap stack g32">
            <div className="sec-head">
              <div className="stack g12">
                <h2 id="browse-h" className="h-2">{t("home.browseTitle")}</h2>
                <p className="sec-lead">{t("home.browseLead")}</p>
              </div>
              <Link className="btn btn-s" href={withLocale(locale, "/services")}>{t("home.viewAll")}<Icon name="arrow" size={16} /></Link>
            </div>
            <ul className="desk">
              {desks.map(({ c, count }) => {
                const office = offices.find((o) => o.cats.includes(c.id));
                const mark = office?.mark ?? null;
                return (
                  <li key={c.id}>
                    <Link href={withLocale(locale, c.href ?? `/services?category=${c.id}`)}>
                      <span className="desk-markslot">
                        {mark ? <Image className="desk-mark" width={156} height={32} src={mark} alt="" /> : office && <span className="desk-word">{office.code === "CIV" ? t("home.filedCivil") : officeCopy(office, locale).name}</span>}
                      </span>
                      <span className="desk-name">{c.short}</span>
                      <span className="desk-foot">
                        <span>{count === 1 ? t("home.oneService") : t("home.nServices", { n: count })}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {more.length > 0 && (
              <p className="desk-more">
                <span>{t("home.groupAlso")}</span>
                {more.map(({ c }) => (
                  <Link key={c.id} href={withLocale(locale, c.href ?? `/services?category=${c.id}`)}>{c.href ? t("home.notListed") : c.short}</Link>
                ))}
              </p>
            )}
            <p className="fee-line row g8"><Icon name="shield" size={18} color="var(--ok)" /><span>{t("home.feeLine")}</span></p>
          </div>
        </section>

        <section id="how" className="sec sec-tint" aria-labelledby="how-h">
          <div className="wrap how-grid">
            <div className="stack g20">
              <h2 id="how-h" className="h-2">{t("home.howTitle")}</h2>
              <QuickSteps locale={locale} />
            </div>
            <Image className="how-art" src="/illustrations/agent-with-client.svg" alt="" width={833} height={633} loading="lazy" decoding="async" />
          </div>
        </section>

        <section id="help" className="sec" aria-labelledby="faq-h">
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
              <p className="people">
                <span className="people-faces" aria-hidden="true">
                  <Image src="/illustrations/agent-woman.svg" alt="" width={48} height={48} loading="lazy" />
                  <Image src="/illustrations/agent-man.svg" alt="" width={48} height={48} loading="lazy" />
                </span>
                {t("home.people")}
              </p>
              <h2 id="cta-h" className="h-2">{t("home.closeTitle")}</h2>
              <p className="sec-lead">{t("home.closeLead")}</p>
              <div className="close-ctas">
                <Link className="btn btn-p btn-lg" href={withLocale(locale, "/services")}>{t("home.start")}</Link>
                <Link className="btn btn-s btn-lg" href={withLocale(locale, "/start")}>{t("home.notListed")}</Link>
              </div>
            </div>
            <div className="contact-card">
              <ContactList />
              <p className="contact-hours"><Icon name="pin" size={16} />{isSet(SITE.address) ? `${SITE.address}, ${SITE.city}` : t("footer.visit", { city: SITE.city })}</p>
              <p className="contact-hours"><Icon name="clock" size={16} />{t("home.hours", { hours: t("hours"), time: t("responseTime") })}</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
