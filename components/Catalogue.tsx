"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { billingKind } from "@/lib/format";
import type { Audience, Category, Service } from "@/lib/types";
import { Icon, ServiceCard } from "./ui";

type FeeKind = ReturnType<typeof billingKind>;

export default function Catalogue({ services, categories, initialQuery, initialCategory }: { services: Service[]; categories: Category[]; initialQuery: string; initialCategory: string }) {
  const [q, setQ] = useState(initialQuery);
  const [cat, setCat] = useState(categories.some((c) => c.id === initialCategory) ? initialCategory : "all");
  const [aud, setAud] = useState<Audience[]>([]);
  const [fees, setFees] = useState<FeeKind[]>([]);
  const [sort, setSort] = useState("popular");
  const [showFilters, setShowFilters] = useState(false);

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const r = services.filter((s) => {
      if (cat !== "all" && s.category !== cat) return false;
      if (aud.length && !aud.some((a) => s.audience.includes(a))) return false;
      if (fees.length && !fees.includes(billingKind(s))) return false;
      if (!term) return true;
      const hay = [s.name, s.aka, s.summary, s.authority, s.channel, categories.find((c) => c.id === s.category)?.name].join(" ").toLowerCase();
      return term.split(/\s+/).every((t) => hay.includes(t));
    });
    if (sort === "cost") return [...r].sort((a, b) => a.ours - b.ours);
    if (sort === "name") return [...r].sort((a, b) => a.name.localeCompare(b.name));
    return [...r].sort((a, b) => Number(!!b.popular) - Number(!!a.popular));
  }, [services, categories, q, cat, aud, fees, sort]);

  const filters = (
    <aside className="stack g28" style={{ width: 260, flexShrink: 0, maxWidth: "100%" }} aria-label="Filters">
      <fieldset className="stack g12" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="eb" style={{ marginBottom: 12 }}>I am</legend>
        {([["individual", "An individual"], ["business", "An entrepreneur / SME"], ["organization", "An organization"]] as [Audience, string][]).map(([k, l]) => (
          <label key={k} className="check"><input type="checkbox" checked={aud.includes(k)} onChange={() => setAud(toggle(aud, k))} /> {l}</label>
        ))}
      </fieldset>
      <fieldset className="stack g12" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="eb" style={{ marginBottom: 12 }}>Our fee is paid</legend>
        {([["once", "Once"], ["monthly", "Every month"], ["yearly", "Every year"]] as [FeeKind, string][]).map(([k, l]) => (
          <label key={k} className="check"><input type="checkbox" checked={fees.includes(k)} onChange={() => setFees(toggle(fees, k))} /> {l}</label>
        ))}
      </fieldset>
      <div className="card stack g10" style={{ padding: 18 }}>
        <strong>Not sure what you need?</strong>
        <p className="hint">Describe your situation and an agent will tell you which procedure applies — free, before you commit.</p>
        <Link className="btn btn-d btn-sm" href="/start">Describe my situation</Link>
      </div>
    </aside>
  );

  return (
    <>
      <section className="wrap stack g24" style={{ paddingTop: 40, paddingBottom: 28, borderBottom: "1px solid var(--line)" }}>
        <nav aria-label="Breadcrumb" className="mut row g8" style={{ fontSize: 14 }}><Link href="/">Home</Link><span>/</span><span>Services</span></nav>
        <div className="stack g10"><h1 className="d h-1">Find the service you need</h1><p className="mut" style={{ fontSize: 17 }}>Every price shows the official fee and our fee separately. Need something not listed? <Link href="/start">Ask us</Link>.</p></div>
        <form className="card searchbox" style={{ maxWidth: 900 }} role="search" onSubmit={(e) => e.preventDefault()}>
          <Icon name="search" size={22} />
          <label htmlFor="cq" className="sr-only">What service do you need?</label>
          <input id="cq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="What service do you need?" autoComplete="off" />
          {q && <button type="button" className="btn btn-g btn-ico" aria-label="Clear search" onClick={() => setQ("")}><Icon name="x" size={18} /></button>}
          <button className="btn btn-p btn-lg m-hide" type="submit">Search</button>
        </form>
        <div className="chips-scroll" role="group" aria-label="Category">
          <button type="button" className={`chip ${cat === "all" ? "chip-on" : ""}`} aria-pressed={cat === "all"} onClick={() => setCat("all")}>All services</button>
          {categories.map((c) => c.href
            ? <Link key={c.id} className="chip" href={c.href}>{c.name} <Icon name="arrow" size={15} /></Link>
            : <button key={c.id} type="button" className={`chip ${cat === c.id ? "chip-on" : ""}`} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>)}
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
                <option value="popular">Most requested</option><option value="cost">Lowest fee first</option><option value="name">A–Z</option>
              </select>
            </div>
          </div>
          {showFilters && <div className="d-hide card" style={{ padding: 18 }}>{filters}</div>}
          {results.length ? (
            <div className="grid cols-3">{results.map((s) => <ServiceCard key={s.slug} s={s} category={catName(s.category)} />)}</div>
          ) : (
            <div className="card stack g12" style={{ padding: "40px 24px", alignItems: "center", textAlign: "center" }}>
              <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--bone)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="search" size={26} /></span>
              <strong>No matching service — yet</strong>
              <span className="hint" style={{ maxWidth: 420 }}>Our catalogue grows every week. Describe what you need and an agent will find the right procedure for you.</span>
              <div className="row g8 wrapx" style={{ justifyContent: "center" }}><button type="button" className="btn btn-s btn-sm" onClick={() => { setQ(""); setCat("all"); setAud([]); setFees([]); }}>Clear filters</button><Link className="btn btn-p btn-sm" href="/start">Describe what I need</Link></div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
