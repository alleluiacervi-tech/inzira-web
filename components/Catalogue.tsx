"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { billingKind } from "@/lib/format";
import { searchText } from "@/lib/i18n/present";
import type { Audience, Category, Service } from "@/lib/types";
import { useI18n } from "./I18n";
import { ServiceRows } from "./PriceList";
import { Icon } from "./ui";
import { useDialog } from "./useDialog";

type FeeKind = ReturnType<typeof billingKind>;

export default function Catalogue({ services, categories, initialQuery, initialCategory }: { services: Service[]; categories: Category[]; initialQuery: string; initialCategory: string }) {
  const { t } = useI18n();
  const [q, setQ] = useState(initialQuery);
  const [cat, setCat] = useState(categories.some((c) => c.id === initialCategory) ? initialCategory : "all");
  const [aud, setAud] = useState<Audience[]>([]);
  const [fees, setFees] = useState<FeeKind[]>([]);
  const [sort, setSort] = useState("popular");
  const [showFilters, setShowFilters] = useState(false);
  const sheet = useDialog<HTMLDivElement>(showFilters, () => setShowFilters(false));

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
    if (sort === "cost") return [...r].sort((a, b) => a.ours - b.ours);
    if (sort === "name") return [...r].sort((a, b) => a.name.localeCompare(b.name));
    return [...r].sort((a, b) => Number(!!b.popular) - Number(!!a.popular));
  }, [services, categories, q, cat, aud, fees, sort]);

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
        <p className="hint">{t("catalogue.unsureBody")}</p>
        <Link className="btn btn-p btn-sm" href="/start">{t("catalogue.describe")}</Link>
      </div>
    </aside>
  );

  return (
    <>
      <section className="wrap stack g24" style={{ paddingTop: 40, paddingBottom: 28, borderBottom: "1px solid var(--line)" }}>
        <nav aria-label={t("catalogue.crumb")} className="mut row g8" style={{ fontSize: 14 }}><Link href="/">{t("catalogue.home")}</Link><span>/</span><span>{t("catalogue.services")}</span></nav>
        <div className="stack g10"><h1 className="d h-1">{t("catalogue.title")}</h1><p className="mut" style={{ fontSize: 17 }}>{t("catalogue.lead")} <Link href="/start">{t("catalogue.ask")}</Link>.</p></div>
        <form className="card searchbox" style={{ maxWidth: 900 }} role="search" onSubmit={(e) => e.preventDefault()}>
          <Icon name="search" size={22} />
          <label htmlFor="cq" className="sr-only">{t("catalogue.searchLabel")}</label>
          <input id="cq" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("catalogue.searchLabel")} autoComplete="off" />
          {q && <button type="button" className="btn btn-g btn-ico" aria-label={t("catalogue.clear")} onClick={() => setQ("")}><Icon name="x" size={18} /></button>}
          <button className="btn btn-p btn-lg m-hide" type="submit">{t("catalogue.search")}</button>
        </form>
        <div className="chips-scroll" role="group" aria-label={t("catalogue.category")}>
          <button type="button" className={`chip ${cat === "all" ? "chip-on" : ""}`} aria-pressed={cat === "all"} onClick={() => setCat("all")}>{t("catalogue.all")}</button>
          {categories.map((c) => c.href
            ? <Link key={c.id} className="chip" href={c.href}>{c.name} <Icon name="arrow" size={15} /></Link>
            : <button key={c.id} type="button" className={`chip ${cat === c.id ? "chip-on" : ""}`} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>)}
        </div>
      </section>

      <section className="wrap row g40" style={{ paddingTop: 32, paddingBottom: 80, alignItems: "flex-start" }}>
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
              <div className="row g8 wrapx" style={{ justifyContent: "center" }}><button type="button" className="btn btn-s btn-sm" onClick={() => { setQ(""); setCat("all"); setAud([]); setFees([]); }}>{t("catalogue.clearFilters")}</button><Link className="btn btn-p btn-sm" href="/start">{t("catalogue.describeNeed")}</Link></div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
