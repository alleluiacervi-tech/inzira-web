import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { Alert, FeeBreakdown, Icon, Plate } from "@/components/ui";
import { ServiceRows } from "@/components/PriceList";
import { officeFor } from "@/lib/institutions";
import { fmtDate } from "@/lib/format";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { displayOfficial, displayOurs, displayTotal, localizeCategory, localizeService, localizeServices, officeText } from "@/lib/i18n/present";
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
  const office = officeFor(s.category);
  const officeName = office ? officeText(office.code, locale)?.name ?? office.name : catName(s.category);
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
        <section className="wrap split svc-main" style={{ ["--aside" as string]: "440px" }}>
          <div className="stack" style={{ gap: 48 }}>
            <div className="stack g18">
              {office && <p className="row g12 svc-office"><Plate code={office.code} size="sm" />{training ? t("service.trainingVia", { via: s.via }) : t("service.filedWith", { office: office.code === "Irembo" ? "Irembo" : locale === "en" ? `the ${officeName}` : officeName, channel: s.channel })}</p>}
              <h1 className="d h-1">{s.name}</h1>
              {s.aka && <p className="mut">{t("service.also", { aka: s.aka })}</p>}
              <p className="sec-lead">{s.summary}</p>
              <ul className="svc-facts">
                {!training && <li><Icon name="clock" size={18} />{s.time}*</li>}
                {s.documents.length > 0 && <li><Icon name="file-text" size={18} />{s.documents.length} {s.documents.length === 1 ? t("service.oneDoc") : t("service.manyDocs")}</li>}
                <li><Icon name="file" size={18} />{training ? t("service.ourFee", { fee: displayOurs(s, locale) }) : t("service.receipt")}</li>
              </ul>
              <dl className="fee-mini show-split">
                <div><dt>{t("service.officialShort")}</dt><dd>{displayOfficial(s, locale)}</dd></div>
                <div><dt>{t("service.assistShort")}</dt><dd className="fee-ours">{displayOurs(s, locale)}</dd></div>
                <div><dt>{t("service.totalShort")}</dt><dd>{displayTotal(s, locale)}</dd></div>
              </dl>
            </div>
            <div className="stack g16"><h2 className="d h-3">{t("service.who")}</h2>
              <div className="grid cols-3" style={{ gap: 12 }}>{s.who.map((w) => <div key={w.title} className="card stack g6" style={{ padding: 18 }}><strong>{w.title}</strong><span className="hint">{w.body}</span></div>)}</div>
            </div>
            <div className="stack g14"><h2 className="d h-3">{t("service.need")}</h2>
              <ul className="stack g12" style={{ listStyle: "none", margin: 0, padding: 0 }}>{s.requirements.map((r) => <li key={r} className="row g12 svc-req"><Icon name="check" size={20} stroke={2.2} color="var(--brand-2)" />{r}</li>)}</ul>
            </div>
            {s.documents.length > 0 && <div className="stack g14"><h2 className="d h-3">{t("service.send")}</h2>
              <p className="hint" style={{ marginTop: -4 }}>{t("service.sendHint")}</p>
              <ul className="doc-list">
                {s.documents.map((d) => (
                  <li key={d.name}>
                    <span className="doc-ico"><Icon name="file-text" size={20} /></span>
                    <span className="stack" style={{ gap: 3, minWidth: 0 }}><strong>{d.name}</strong><span className="hint">{d.detail}</span></span>
                    <span className={`tag ${d.required ? "tag-ember" : ""}`}>{d.required ? t("service.required") : t("service.ifApplicable")}</span>
                  </li>
                ))}
              </ul>
            </div>}
            <div className="stack g18"><h2 className="d h-3">{t("service.how")}</h2>
              <ol className="svc-steps">
                {s.steps.map((st, i) => (
                  <li key={st.title} className={st.you ? "is-you" : undefined}>
                    <span className="svc-step-n" aria-hidden="true">{i + 1}</span>
                    <div className="stack g4"><strong className="row g10 wrapx svc-step-t">{st.title}{st.you && <span className="tag tag-ember">{t("service.you")}</span>}</strong><span className="svc-step-d">{st.body}</span></div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="stack g12"><h2 className="d h-3">{t("service.notes")}</h2>
              {!training && <Alert kind="info" title={t("service.timeTitle")}>{t("service.timeBody", { time: s.time.replace(/^\*/, "") })}</Alert>}
              {training && s.notes.length === 0 && <Alert kind="info" title={t("service.sessionTitle")}>{t("service.sessionBody")}</Alert>}
              {s.notes.map((n) => <Alert key={n.title} kind={n.kind} title={n.title}>{n.body}</Alert>)}
            </div>
          </div>
          <aside className="stack g16 sticky-aside">
            <FeeBreakdown official={displayOfficial(s, locale)} officialNote={s.official.note} ours={displayOurs(s, locale)} total={displayTotal(s, locale)}>
              <Link className="btn btn-p btn-lg" href={withLocale(locale, `/start/${s.slug}`)}>{t("service.start")}</Link>
              <span className="hint" style={{ textAlign: "center" }}>{t("service.noPay")}</span>
            </FeeBreakdown>
            {s.official.verifiedAt && <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="calendar" size={16} /><span>{t("service.checked", { who: s.authority, date: fmtDate(s.official.verifiedAt, locale) })}</span></p>}
            <div className="card stack g12" style={{ padding: 18 }}>
              <div className="row g10"><Icon name="clock" size={18} /><span className="svc-side-t">{t("service.responds", { time: t("responseTime") })}</span></div>
              <div className="row g10"><Icon name="msg" size={18} /><span className="svc-side-t">{t("service.updates")}</span></div>
              {!training && <div className="row g10"><Icon name="refresh" size={18} /><span className="svc-side-t">{t("service.refund")}</span></div>}
            </div>
            <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} /><span>{t("service.privateOffice", { who: office && office.code !== "Irembo" ? office.code : t("service.privateGov") })}</span></p>
          </aside>
        </section>
        <section className="wrap stack g18" style={{ paddingBottom: 80 }}>
          <h2 className="d h-3">{t("service.together")}</h2>
          <div style={{ maxWidth: 860 }}><ServiceRows services={related} /></div>
        </section>
        <div className="startbar">
          <span className="stack"><span className="startbar-l">{t("service.assistShort")}</span><strong className="fig startbar-v">{displayOurs(s, locale)}</strong></span>
          <Link className="btn btn-p btn-lg" href={withLocale(locale, `/start/${s.slug}`)}>{t("service.start")}</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
