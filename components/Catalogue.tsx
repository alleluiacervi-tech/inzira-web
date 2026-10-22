"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { billingKind, rwf } from "@/lib/format";
import { REVIEW_FEE, checkoutPrice } from "@/lib/pricing";
import { searchText } from "@/lib/i18n/present";
import type { Audience, Category, Service } from "@/lib/types";
import { withLocale } from "@/lib/seo";
import { useI18n } from "./I18n";
import { ServiceRows } from "./PriceList";
import { Icon } from "./ui";
import { useDialog } from "./useDialog";

type FeeKind = ReturnType<typeof billingKind>;

const AUDIENCES: Audience[] = ["individual", "business", "organization"];
const FEE_KINDS: FeeKind[] = ["once", "monthly", "yearly"];
const SORTS = ["popular", "cost", "name"];
const listParam = <T extends string>(raw: string | null, allowed: readonly T[]) => (raw?.split(",").filter((v): v is T => (allowed as readonly string[]).includes(v)) ?? []);

export default function Catalogue({ services, categories, initialQuery, initialCategory }: { services: Service[]; categories: Category[]; initialQuery: string; initialCategory: string }) {
  const { locale, t } = useI18n();
  const [q, setQ] = useState(initialQuery);
  const [cat, setCat] = useState(categories.some((c) => c.id === initialCategory) ? initialCategory : "all");
  // What you filtered by lives in the address too, so a filtered list can be shared or reopened.
  const params = useSearchParams();
  const [aud, setAud] = useState<Audience[]>(() => listParam(params.get("for"), AUDIENCES));
  const [fees, setFees] = useState<FeeKind[]>(() => listParam(params.get("fee"), FEE_KINDS));
  const [sort, setSort] = useState(() => (SORTS.includes(params.get("sort") ?? "") ? (params.get("sort") as string) : "popular"));
  const [showFilters, setShowFilters] = useState(false);
  const sheet = useDialog<HTMLDivElement>(showFilters, () => setShowFilters(false));

  useEffect(() => {
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (cat !== "all") next.set("category", cat);
    if (aud.length) next.set("for", aud.join(","));
    if (fees.length) next.set("fee", fees.join(","));
    if (sort !== "popular") next.set("sort", sort);
    const qs = next.toString();
    const url = location.pathname + (qs ? `?${qs}` : "");
    if (url !== location.pathname + location.search) window.history.replaceState(null, "", url);
  }, [q, cat, aud, fees, sort]);

  // On a phone the row of categories scrolls sideways: keep the chosen one in view.
  const chipRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = chipRow.current, on = row?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (row && on) row.scrollTo({ left: on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2, behavior: "auto" });
  }, [cat]);

  const countIn = (id: string) => services.filter((x) => x.category === id).length;

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const r = services.filter((s) => {
      if (cat !== "all" && s.category !== cat) return false;
      if (aud.length && !aud.some((a) => s.audience.includes(a))) return false;
      if (fees.length && !fees.includes(billingKind(s))) return false;
      if (!term) return true;
      const hay = [searchText(s), categories.find((c) => c.id === s.category)?.name].join(" ").toLowerCase();
      return term.split(/\s+/).every((t) => hay.includes(t));
    });
    // By what the customer pays: the whole price where it is settled, otherwise our fee.
    const cost = (x: Service) => checkoutPrice(x)?.total ?? x.ours;
    if (sort === "cost") return [...r].sort((a, b) => cost(a) - cost(b));
    if (sort === "name") return [...r].sort((a, b) => a.name.localeCompare(b.name));
    return [...r].sort((a, b) => Number(!!b.popular) - Number(!!a.popular));
  }, [services, categories, q, cat, aud, fees, sort]);

  const heading = (() => {
    if (cat === "all") return t("catalogue.title");
    const key = `nav.cat.${cat}`;
    const label = t(key);
    const name = label === key ? categories.find((c) => c.id === cat)?.name ?? label : label;
    return t("meta.inPlace", { name });
  })();

  const filters = (
    <aside className="stack g28" style={{ width: 260, flexShrink: 0, maxWidth: "100%" }} aria-label={t("catalogue.filters")}>
      <fieldset className="stack g12" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="eb" style={{ marginBottom: 12 }}>{t("catalogue.iAm")}</legend>
        {([["individual", t("catalogue.individual")], ["business", t("catalogue.business")], ["organization", t("catalogue.organization")]] as [Audience, string][]).map(([k, l]) => (
          <label key={k} className="check"><input type="checkbox" checked={aud.includes(k)} onChange={() => setAud(toggle(aud, k))} /> {l}</label>
        ))}
      </fieldset>
      <fieldset className="stack g12" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="eb" style={{ marginBottom: 12 }}>{t("catalogue.feePaid")}</legend>
        {([["once", t("catalogue.once")], ["monthly", t("catalogue.monthly")], ["yearly", t("catalogue.yearly")]] as [FeeKind, string][]).map(([k, l]) => (
          <label key={k} className="check"><input type="checkbox" checked={fees.includes(k)} onChange={() => setFees(toggle(fees, k))} /> {l}</label>
        ))}
      </fieldset>
      <div className="card stack g10" style={{ padding: 18 }}>
        <strong>{t("catalogue.unsure")}</strong>
        <p className="hint">{REVIEW_FEE > 0 ? t("catalogue.unsureBodyFee", { fee: rwf(REVIEW_FEE) }) : t("catalogue.unsureBody")}</p>
        <Link className="btn btn-p btn-sm" href={withLocale(locale, "/start")}>{t("catalogue.describe")}</Link>
      </div>
    </aside>
  );

  return (
    <>
      <section className="cat-head">
        <div className="wrap stack g20">
          <nav aria-label={t("catalogue.crumb")} className="crumbs"><Link href={withLocale(locale, "/")}>{t("catalogue.home")}</Link><Icon name="right" size={14} /><span aria-current="page">{t("catalogue.services")}</span></nav>
          <div className="stack g8"><h1 className="h-1">{heading}</h1><p className="sec-lead">{t("catalogue.lead")} <Link href={withLocale(locale, "/start")}>{t("catalogue.ask")}</Link>.</p></div>
          <form className="hero-search-box cat-search" role="search" onSubmit={(e) => e.preventDefault()}>
            <Icon name="search" size={22} />
            <label htmlFor="cq" className="sr-only">{t("catalogue.searchLabel")}</label>
            <input id="cq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("catalogue.searchLabel")} autoComplete="off" enterKeyHint="search" />
            {q && <button type="button" className="btn btn-g btn-ico" aria-label={t("catalogue.clear")} onClick={() => setQ("")}><Icon name="x" size={18} /></button>}
          </form>
          <div ref={chipRow} className="chips-scroll cat-chips" role="group" aria-label={t("catalogue.category")}>
            <button type="button" className={`chip ${cat === "all" ? "chip-on" : ""}`} aria-pressed={cat === "all"} onClick={() => setCat("all")}>{t("catalogue.all")}<span className="chip-n">{services.length}</span></button>
            {categories.map((c) => c.href
              ? <Link key={c.id} className="chip" href={withLocale(locale, c.href)}><Icon name={c.icon} size={18} />{c.name} <Icon name="arrow" size={15} /></Link>
              : <button key={c.id} type="button" className={`chip ${cat === c.id ? "chip-on" : ""}`} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}><Icon name={c.icon} size={18} />{c.name}<span className="chip-n">{countIn(c.id)}</span></button>)}
          </div>
        </div>
      </section>

      <section className="wrap row g40 cat-body">
        <div className="m-hide">{filters}</div>
        <div className="stack g18 grow">
          <div className="row between g12 wrapx">
            <span style={{ fontSize: 15 }} aria-live="polite"><strong>{results.length}</strong> <span className="mut">{results.length === 1 ? t("catalogue.one") : t("catalogue.many")}{q && <> {t("catalogue.forQuery", { q })}</>}</span></span>
            <div className="row g8">
              <button type="button" className="btn btn-s btn-sm d-hide" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><Icon name="filter" size={16} /> {t("catalogue.filters")}{aud.length + fees.length ? ` · ${aud.length + fees.length}` : ""}</button>
              <label htmlFor="srt" className="mut m-hide" style={{ fontWeight: 500 }}>{t("catalogue.sort")}</label>
              <select id="srt" className="in" style={{ width: 180, height: 40 }} value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="popular">{t("catalogue.popular")}</option><option value="cost">{t("catalogue.cost")}</option><option value="name">{t("catalogue.az")}</option>
              </select>
            </div>
          </div>
          {showFilters && (
            <div className="sheet-bg d-hide" onClick={(e) => { if (e.target === e.currentTarget) setShowFilters(false); }}>
              <div ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
                <div className="row between" style={{ padding: "6px 0 14px" }}>
                  <h2 id="sheet-title" className="d" style={{ fontSize: 20 }}>{t("catalogue.filters")}</h2>
                  <button type="button" className="btn btn-g btn-ico" aria-label={t("catalogue.closeFilters")} onClick={() => setShowFilters(false)}><Icon name="x" size={22} /></button>
                </div>
                <div className="sheet-body">{filters}</div>
                <div className="row g10 sheet-foot">
                  <button type="button" className="btn btn-s" disabled={!aud.length && !fees.length} onClick={() => { setAud([]); setFees([]); }}>{t("catalogue.clear")}</button>
                  <button type="button" className="btn btn-p grow" onClick={() => setShowFilters(false)}>{t("catalogue.show", { n: results.length, what: results.length === 1 ? t("catalogue.one") : t("catalogue.many") })}</button>
                </div>
              </div>
            </div>
          )}
          {results.length ? (
            <ServiceRows services={results} />
          ) : (
            <div className="card stack g12" style={{ padding: "40px 24px", alignItems: "center", textAlign: "center" }}>
              <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--bone)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="search" size={26} /></span>
              <strong>{q ? t("catalogue.noQuery", { q }) : t("catalogue.noFilters")}</strong>
              <span className="hint" style={{ maxWidth: 420 }}>{t("catalogue.noHint")}</span>
              <div className="row g8 wrapx" style={{ justifyContent: "center" }}><button type="button" className="btn btn-s btn-sm" onClick={() => { setQ(""); setCat("all"); setAud([]); setFees([]); }}>{t("catalogue.clearFilters")}</button><Link className="btn btn-p btn-sm" href={withLocale(locale, "/start")}>{t("catalogue.describeNeed")}</Link></div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
