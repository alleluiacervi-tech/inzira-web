import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { Alert, Icon, Plate } from "@/components/ui";
import { QuickSteps } from "@/components/QuickSteps";
import { ServiceRows } from "@/components/PriceList";
import { officeFor } from "@/lib/institutions";
import { fmtDate, rwf } from "@/lib/format";
import { checkoutPrice, optionRange, reviewFeeFor, withOption } from "@/lib/pricing";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { displayOfficial, displayOurs, displayPrice, displayTime, displayTotal, localizeCategory, localizeService, localizeServices, officeText } from "@/lib/i18n/present";
import { getService, listCategories, listServices } from "@/lib/repo";
import { JsonLd } from "@/components/JsonLd";
import { languageAlternates, withLocale } from "@/lib/seo";
import { SITE, siteOrigin } from "@/lib/site";


export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const [locale, raw] = await Promise.all([getLocale(), getService((await params).slug)]);
  if (!raw) return {};
  const s = localizeService(raw, locale);
  const t = (path: string, vars?: Record<string, string | number>) => text(locale, path, vars);
  const tail = t("meta.serviceTail");
  const description = s.summary.length + tail.length < 180 ? `${s.summary} ${tail}` : s.summary;
  const origin = siteOrigin();
  return {
    title: t("meta.inPlace", { name: s.name }),
    description,
    ...(origin ? { alternates: languageAlternates(origin, `/services/${s.slug}`, locale) } : {}),
  };
}

export default async function ServiceDetail({ params }: { params: Promise<{ slug: string }> }) {
  const locale = await getLocale();
  const t = (path: string, vars?: Record<string, string | number>) => text(locale, path, vars);
  const [raw, all, categories] = await Promise.all([getService((await params).slug), listServices(), listCategories()]);
  if (!raw || !raw.visible) notFound();
  const s = localizeService(raw, locale);
  const services = localizeServices(all, locale);
  const cats = categories.map((c) => localizeCategory(c, locale));
  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? "";
  const training = s.official.mode === "none";
  // What sending the request costs: the whole price when it is settled, otherwise the review fee (lib/pricing.ts).
  const price = checkoutPrice(s);
  // Priced by option (passport type, test type): paid in full like a settled price, once the option is picked.
  const paidUpfront = !!(price || optionRange(s));
  const reviewFee = reviewFeeFor(s);
  const office = officeFor(s.category);
  const officeName = office ? officeText(office.code, locale)?.name ?? office.name : catName(s.category);
  const priceLabel = displayPrice(s, locale);
  // The one line under the name; a service saved before taglines existed shows its summary's first sentence.
  const tagline = s.tagline || s.summary.split(/(?<=\.)\s/)[0];
  const shortTimeText = displayTime(s, locale);
  const related = services.filter((x) => x.slug !== s.slug).sort((a, b) => Number(b.category === s.category) - Number(a.category === s.category)).slice(0, 4);

  const origin = siteOrigin();
  const pageUrl = (path: string) => (origin ? origin + withLocale(locale, path) : undefined);
  const crumbs = [
    { name: t("catalogue.home"), path: "/" },
    { name: t("nav.services"), path: "/services" },
    { name: officeName, path: `/services?category=${s.category}` },
    { name: s.name, path: `/services/${s.slug}` },
  ];
  return (
    <>
      {origin && (
        <JsonLd data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: pageUrl(c.path) })),
            },
            {
              "@type": "Service",
              name: s.name,
              description: s.summary,
              serviceType: s.name,
              url: pageUrl(`/services/${s.slug}`),
              areaServed: { "@type": "Country", name: "Rwanda" },
              provider: { "@type": "Organization", name: SITE.legalName, url: origin },
            },
          ],
        }} />
      )}
      <PublicNav />
      <main id="main">
        <div className="wrap" style={{ paddingTop: 28 }}>
          <nav aria-label={t("catalogue.crumb")} className="crumbs">
            <Link href={withLocale(locale, "/")}>{t("catalogue.home")}</Link><Icon name="right" size={14} /><Link href={withLocale(locale, "/services")}>{t("nav.services")}</Link><Icon name="right" size={14} /><Link href={withLocale(locale, `/services?category=${s.category}`)}>{officeName}</Link><Icon name="right" size={14} /><span aria-current="page">{s.name}</span>
          </nav>
        </div>
        {/* The first screen holds what a customer decides on: what it is, the price, the time, what they need, and Start. */}
        <section className="wrap svc-hero">
          {office && <p className="row g10 svc-office"><Plate code={office.code} size="sm" />{training ? t("service.trainingVia", { via: s.via }) : t("service.filedWith", { office: office.code === "Irembo" ? "Irembo" : locale === "en" ? `the ${officeName}` : officeName, channel: s.channel })}</p>}
          <h1 className="d h-1">{s.name}</h1>
          <p className="svc-tag">{tagline}</p>
          <ul className="svc-chips" aria-label={t("service.facts")}>
            <li data-price><Icon name="card" size={18} /><span><strong className="fig">{priceLabel.amount}</strong>{priceLabel.note && <span className="svc-chip-note"> {priceLabel.note}</span>}</span></li>
            <li><Icon name="clock" size={18} /><span>{shortTimeText}</span></li>
            <li><Icon name="file-text" size={18} /><span>{t("service.needs", { docs: s.docsShort })}</span></li>
            {s.inPerson && <li data-in-person-chip><Icon name="pin" size={18} /><span>{t("service.inPerson")}</span></li>}
          </ul>
          {s.inPerson && <p className="svc-inperson">{s.inPerson}</p>}
          <div className="svc-cta">
            <Link className="btn btn-p btn-lg" href={withLocale(locale, `/start/${s.slug}`)} data-start>{t("service.startShort")}</Link>
            <span className="hint">{training ? t("service.trainLine") : paidUpfront ? t("service.payLine") : reviewFee ? t("service.reviewLine", { fee: rwf(reviewFee) }) : t("service.noPay")}</span>
          </div>
          {/* Only what can change the decision stays open: a reason the institution may refuse, a bill that lapses. */}
          {s.notes.filter((n) => n.kind === "warn").map((n) => <Alert key={n.title} kind="warn" title={n.title}>{n.body}</Alert>)}
        </section>
        <section className="wrap stack g14 svc-block">
          <h2 className="d h-3">{t("service.how")}</h2>
          <QuickSteps locale={locale} kind={training ? "training" : paidUpfront ? "paid" : "quote"} fee={reviewFee ? rwf(reviewFee) : ""} />
        </section>
        <section className="wrap svc-block">
          <details className="svc-details">
            <summary><span>{t("service.details")}</span><Icon name="down" size={20} /></summary>
            <div className="stack g24 svc-details-body">
              <p className="sec-lead" style={{ margin: 0 }}>{s.summary}</p>
              {s.aka && <p className="mut" style={{ margin: 0 }}>{t("service.also", { aka: s.aka })}</p>}
              {s.who.length > 0 && <div className="stack g10"><h3 className="svc-dh">{t("service.who")}</h3>
                <ul className="svc-dlist">{s.who.map((w) => <li key={w.title}><strong>{w.title}</strong> · {w.body}</li>)}</ul></div>}
              <div className="stack g10"><h3 className="svc-dh">{t("service.need")}</h3>
                <ul className="svc-dlist">{s.requirements.map((r) => <li key={r}>{r}</li>)}</ul></div>
              {s.documents.length > 0 && <div className="stack g10"><h3 className="svc-dh">{t("service.send")}</h3>
                <ul className="doc-list">
                  {s.documents.map((d) => (
                    <li key={d.name}>
                      <span className="doc-ico"><Icon name="file-text" size={20} /></span>
                      <span className="stack" style={{ gap: 3, minWidth: 0 }}><strong>{d.name}</strong><span className="hint">{d.detail}</span></span>
                      <span className={`tag ${d.required ? "tag-ember" : ""}`}>{d.required ? t("service.required") : t("service.ifApplicable")}</span>
                    </li>
                  ))}
                </ul></div>}
              <div className="stack g10"><h3 className="svc-dh">{t("service.priceTitle")}</h3>
                <dl className="fee-mini show-split" style={{ maxWidth: 420 }}>
                  <div><dt>{t("service.officialShort")}</dt><dd>{displayOfficial(s, locale)}</dd></div>
                  <div><dt>{t("service.assistShort")}</dt><dd className="fee-ours">{displayOurs(s, locale)}</dd></div>
                  <div><dt>{paidUpfront ? t("service.totalFixed") : t("service.totalShort")}</dt><dd>{displayTotal(s, locale)}</dd></div>
                </dl>
                {s.feeOptions?.length ? (
                  <dl className="fee-mini fee-options" style={{ maxWidth: 420 }} data-fee-options>
                    {s.feeOptions.map((o, i) => <div key={o.label}><dt>{o.label}</dt><dd className="fig">{rwf(checkoutPrice(withOption(s, i)!)?.total ?? o.official + s.ours)}</dd></div>)}
                  </dl>
                ) : null}
                <p className="hint" style={{ margin: 0 }}>{s.official.note}</p>
                {s.official.verifiedAt && <p className="hint" style={{ margin: 0 }}>{t("service.checked", { who: s.authority, date: fmtDate(s.official.verifiedAt, locale) })}</p>}</div>
              <div className="stack g10">
                {!training && <Alert kind="info" title={t("service.timeTitle")}>{t("service.timeBody", { time: s.time.replace(/^\*/, "") })}</Alert>}
                {s.notes.filter((n) => n.kind !== "warn").map((n) => <Alert key={n.title} kind={n.kind} title={n.title}>{n.body}</Alert>)}
                <p className="hint row g8" style={{ alignItems: "flex-start", margin: 0 }}><Icon name="shield" size={16} /><span>{t("service.privateOffice", { who: office && office.code !== "Irembo" ? office.code : t("service.privateGov") })}</span></p>
              </div>
            </div>
          </details>
        </section>
        <section className="wrap stack g14" style={{ paddingBottom: 96 }}>
          <h2 className="d h-3">{t("service.together")}</h2>
          <div style={{ maxWidth: 860 }}><ServiceRows services={related} /></div>
        </section>
        <div className="startbar">
          <span className="stack"><strong className="fig startbar-v">{priceLabel.amount}</strong>{priceLabel.note && <span className="startbar-l">{priceLabel.note}</span>}</span>
          <Link className="btn btn-p btn-lg" href={withLocale(locale, `/start/${s.slug}`)}>{t("service.startShort")}</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
