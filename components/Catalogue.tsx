"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORIES, SERVICES, catById, type Service } from "@/lib/data";
import { Icon, ServiceCard } from "./ui";

type Aud = "individual" | "business" | "organization";
type FeeKind = "free" | "fixed" | "varies";
const feeKind = (s: Service): FeeKind => (s.official.amount === null ? "varies" : s.official.amount === 0 ? "free" : "fixed");

export default function Catalogue({ initialQuery, initialCategory }: { initialQuery: string; initialCategory: string }) {
  const [q, setQ] = useState(initialQuery);
  const [cat, setCat] = useState(CATEGORIES.some((c) => c.id === initialCategory) ? initialCategory : "all");
  const [aud, setAud] = useState<Aud[]>([]);
  const [fees, setFees] = useState<FeeKind[]>([]);
  const [sort, setSort] = useState("popular");
  const [showFilters, setShowFilters] = useState(false);

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    let r = SERVICES.filter((s) => {
      if (cat !== "all" && s.category !== cat) return false;
      if (aud.length && !aud.some((a) => s.audience.includes(a))) return false;
      if (fees.length && !fees.includes(feeKind(s))) return false;
      if (!term) return true;
      const hay = [s.name, s.aka, s.summary, s.authority, s.channel, catById(s.category).name].join(" ").toLowerCase();
      return term.split(/\s+/).every((t) => hay.includes(t));
    });
    if (sort === "cost") r = [...r].sort((a, b) => (a.official.amount ?? 1e9) + a.ours - ((b.official.amount ?? 1e9) + b.ours));
    if (sort === "popular") r = [...r].sort((a, b) => Number(!!b.popular) - Number(!!a.popular));
    return r;
  }, [q, cat, aud, fees, sort]);

  const filters = (
    <aside className="stack g28" style={{ width: 260, flexShrink: 0 }} aria-label="Filters">
      <fieldset className="stack g12" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="eb" style={{ marginBottom: 12 }}>I am</legend>
        {([["individual", "An individual"], ["business", "An entrepreneur / SME"], ["organization", "An organization"]] as [Aud, string][]).map(([k, l]) => (
          <label key={k} className="check"><input type="checkbox" checked={aud.includes(k)} onChange={() => setAud(toggle(aud, k))} /> {l}</label>
        ))}
      </fieldset>
      <fieldset className="stack g12" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="eb" style={{ marginBottom: 12 }}>Official fee</legend>
        {([["free", "Free at the institution"], ["fixed", "Fixed fee"], ["varies", "Varies by case"]] as [FeeKind, string][]).map(([k, l]) => (
          <label key={k} className="check"><input type="checkbox" checked={fees.includes(k)} onChange={() => setFees(toggle(fees, k))} /> {l}</label>
        ))}
      </fieldset>
      <div className="card stack g10" style={{ padding: 18 }}>
        <strong>Not sure what you need?</strong>
        <p className="hint">Describe your situation and an agent will tell you which procedure applies — free, before you commit.</p>
        <Link className="btn btn-d btn-sm" href="/start/criminal-record-certificate?describe=1">Describe my situation</Link>
      </div>
    </aside>
  );

  return (
    <>
      <section className="wrap stack g24" style={{ paddingTop: 40, paddingBottom: 28, borderBottom: "1px solid var(--line)" }}>
        <nav aria-label="Breadcrumb" className="mut row g8" style={{ fontSize: 14 }}><Link href="/">Home</Link><span>/</span><span>Services</span></nav>
        <div className="stack g10"><h1 className="d h-1">Find the service you need</h1><p className="mut" style={{ fontSize: 17 }}>Every price shows the official fee and our fee separately.</p></div>
        <form className="card searchbox" style={{ maxWidth: 900 }} role="search" onSubmit={(e) => e.preventDefault()}>
          <Icon name="search" size={22} />
          <label htmlFor="cq" className="sr-only">What service do you need?</label>
          <input id="cq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="What service do you need?" autoComplete="off" />
          {q && <button type="button" className="btn btn-g btn-ico" aria-label="Clear search" onClick={() => setQ("")}><Icon name="x" size={18} /></button>}
          <button className="btn btn-p btn-lg m-hide" type="submit">Search</button>
        </form>
        <div className="chips-scroll" role="group" aria-label="Category">
          <button type="button" className={`chip ${cat === "all" ? "chip-on" : ""}`} aria-pressed={cat === "all"} onClick={() => setCat("all")}>All services</button>
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={`chip ${cat === c.id ? "chip-on" : ""}`} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>
          ))}
        </div>
      </section>

      <section className="wrap row g40" style={{ paddingTop: 32, paddingBottom: 80, alignItems: "flex-start" }}>
        <div className="m-hide">{filters}</div>
        <div className="stack g18 grow">
          <div className="row between g12 wrapx">
            <span style={{ fontSize: 15 }} aria-live="polite"><strong>{results.length}</strong> <span className="mut">{results.length === 1 ? "service" : "services"}{q && <> for “{q}”</>}</span></span>
            <div className="row g8">
              <button type="button" className="btn btn-s btn-sm d-hide" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><Icon name="filter" size={16} /> Filters{aud.length + fees.length ? ` · ${aud.length + fees.length}` : ""}</button>
              <label htmlFor="srt" className="mut m-hide" style={{ fontWeight: 500 }}>Sort by</label>
              <select id="srt" className="in" style={{ width: 180, height: 40 }} value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="popular">Most requested</option><option value="cost">Lowest total cost</option><option value="name">A–Z</option>
              </select>
            </div>
          </div>
          {showFilters && <div className="d-hide card" style={{ padding: 18 }}>{filters}</div>}
          {results.length ? (
            <div className="grid cols-3">{(sort === "name" ? [...results].sort((a, b) => a.name.localeCompare(b.name)) : results).map((s) => <ServiceCard key={s.slug} s={s} />)}</div>
          ) : (
            <div className="card stack g12" style={{ padding: "40px 24px", alignItems: "center", textAlign: "center" }}>
              <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--bone)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="search" size={26} /></span>
              <strong>No matching service — yet</strong>
              <span className="hint" style={{ maxWidth: 420 }}>Our catalogue grows every week. Describe what you need and an agent will find the right procedure for you.</span>
              <div className="row g8"><button type="button" className="btn btn-s btn-sm" onClick={() => { setQ(""); setCat("all"); setAud([]); setFees([]); }}>Clear filters</button><Link className="btn btn-p btn-sm" href="/start/criminal-record-certificate?describe=1">Describe what I need</Link></div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
