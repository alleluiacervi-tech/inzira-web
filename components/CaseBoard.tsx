"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CASES, type StatusKey } from "@/lib/data";
import { Badge, Icon, initials } from "./ui";

const TABS: { id: string; label: string; match: StatusKey[] }[] = [
  { id: "all", label: "All", match: [] },
  { id: "new", label: "New", match: ["new"] },
  { id: "pending", label: "Pending", match: ["rec", "prep"] },
  { id: "customer", label: "Needs customer", match: ["info", "act"] },
  { id: "processing", label: "Processing", match: ["sub", "proc"] },
  { id: "done", label: "Completed", match: ["done"] },
];

export default function CaseBoard() {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const rows = useMemo(() => {
    const t = TABS.find((x) => x.id === tab)!;
    const term = q.toLowerCase();
    return CASES.filter((c) => (!t.match.length || t.match.includes(c.status)) && (!mine || c.agent === "Eric N.") &&
      (!term || [c.customer, c.ref, c.service, c.category].join(" ").toLowerCase().includes(term)));
  }, [tab, q, mine]);
  const n = (id: string) => { const t = TABS.find((x) => x.id === id)!; return t.match.length ? CASES.filter((c) => t.match.includes(c.status)).length : CASES.length; };

  return (
    <section className="card" style={{ overflow: "hidden" }} aria-labelledby="cases-h">
      <h2 id="cases-h" className="sr-only">Cases</h2>
      <div className="stack g12" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
        <div className="row between g12 wrapx">
          <div className="chips-scroll" role="group" aria-label="Filter by stage">
            {TABS.map((t) => <button key={t.id} type="button" className={`chip chip-sm ${tab === t.id ? "chip-on" : ""}`} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label} · {n(t.id)}</button>)}
          </div>
          <div className="row g8 wrapx">
            <div className="card row g8" style={{ padding: "0 12px", height: 36, width: 260 }}>
              <Icon name="search" size={17} /><label htmlFor="cs" className="sr-only">Search cases</label>
              <input id="cs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer, reference, service…" style={{ border: 0, outline: 0, fontSize: 14, width: "100%" }} />
            </div>
            <button type="button" className={`btn btn-sm ${mine ? "btn-d" : "btn-s"}`} aria-pressed={mine} onClick={() => setMine(!mine)}><Icon name="user" size={16} /> Assigned to me</button>
          </div>
        </div>
      </div>
      <div className="case-table table-wrap">
        <table className="tc">
          <thead><tr><th>Customer</th><th>Service</th><th>Category</th><th>Reference</th><th>Assigned agent</th><th>Status</th><th>Payment</th><th>Last updated</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.ref}>
                <td><div className="stack" style={{ gap: 2 }}><strong>{c.customer}</strong><span className="mut" style={{ fontSize: 12.5 }}>{c.type}</span></div></td>
                <td>{c.service}</td>
                <td><span className="tag">{c.category}</span></td>
                <td><span className="m">{c.ref}</span></td>
                <td><span className="row g8"><span className="av" style={{ width: 26, height: 26, fontSize: 10.5 }}>{initials(c.agent)}</span>{c.agent}</span></td>
                <td><Badge k={c.status} /></td>
                <td><Badge k={c.payment} /></td>
                <td className="mut">{c.updated}</td>
                <td style={{ textAlign: "right" }}><Link className="btn btn-s btn-sm" href={`/agent/cases/${c.ref}`} aria-label={`Open case ${c.ref}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="case-cards">
        {rows.map((c) => (
          <Link key={c.ref} href={`/agent/cases/${c.ref}`} className="card stack g10" style={{ padding: 16, textDecoration: "none", color: "var(--ink)" }}>
            <div className="row between"><span className="m mut">{c.ref}</span><Badge k={c.status} /></div>
            <div className="stack" style={{ gap: 3 }}><strong style={{ fontSize: 15.5 }}>{c.customer}</strong><span className="mut" style={{ fontSize: 13.5 }}>{c.service} · {c.category}</span></div>
            <div className="row between" style={{ paddingTop: 10, borderTop: "1px solid var(--line-2)" }}><Badge k={c.payment} /><span className="mut" style={{ fontSize: 12.5 }}>{c.agent} · {c.updated}</span></div>
          </Link>
        ))}
      </div>
      {rows.length === 0 && <div className="stack g8" style={{ padding: 40, alignItems: "center", textAlign: "center" }}><strong>No cases match</strong><span className="hint">Try another stage or clear the search.</span></div>}
      <div className="row between" style={{ padding: "12px 16px", borderTop: "1px solid var(--line)" }}><span className="mut" style={{ fontSize: 13.5 }}>Showing {rows.length} of {CASES.length}</span></div>
    </section>
  );
}
