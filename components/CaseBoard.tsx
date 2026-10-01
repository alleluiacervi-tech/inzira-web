"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtAgo, initials, shortName } from "@/lib/format";
import { payStatus } from "@/lib/status";
import type { RequestView } from "@/lib/types";
import { Icon, PayBadge, RequestBadge } from "./ui";

/** Who has the work right now. Every case is in exactly one bucket. */
type Bucket = "new" | "ours" | "customer" | "institution" | "done";
const bucket = (r: RequestView): Bucket =>
  r.closed || r.stage === "completed" ? "done" : r.hold ? "customer" : r.stage === "received" ? "new" : r.stage === "institution" ? "institution" : "ours";
const TABS: { id: "all" | Bucket; label: string }[] = [
  { id: "all", label: "All" }, { id: "new", label: "New" }, { id: "ours", label: "With us" },
  { id: "customer", label: "Waiting on customer" }, { id: "institution", label: "With institution" }, { id: "done", label: "Finished" },
];
export const KIND = { person: "Individual", business: "Business", organization: "Organization" } as const;

export default function CaseBoard({ cases, categories, me, now }: { cases: RequestView[]; categories: Record<string, string>; me: string; now: string }) {
  const [tab, setTab] = useState<"all" | Bucket>("all");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return cases.filter((c) => (tab === "all" || bucket(c) === tab) && (!mine || c.agentId === me) &&
      (!term || [c.profile.name, c.account.name, c.ref, c.officialRef, c.name, categories[c.service.category]].join(" ").toLowerCase().includes(term)));
  }, [cases, categories, me, tab, q, mine]);
  const n = (id: "all" | Bucket) => (id === "all" ? cases.length : cases.filter((c) => bucket(c) === id).length);

  return (
    <section id="cases" className="card" style={{ overflow: "hidden" }} aria-labelledby="cases-h">
      <h2 id="cases-h" className="sr-only">Cases</h2>
      <div className="stack g12" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
        <div className="row between g12 wrapx">
          <div className="chips-scroll" role="group" aria-label="Filter by who has the work">
            {TABS.map((t) => <button key={t.id} type="button" className={`chip chip-sm ${tab === t.id ? "chip-on" : ""}`} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label} · {n(t.id)}</button>)}
          </div>
          <div className="row g8 wrapx">
            <div className="card row g8" style={{ padding: "0 12px", height: 36, width: 260, maxWidth: "100%" }}>
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
                <td><div className="stack" style={{ gap: 2 }}><strong>{c.profile.name}</strong><span className="mut" style={{ fontSize: 12.5 }}>{KIND[c.profile.kind]}</span></div></td>
                <td>{c.name}</td>
                <td><span className="tag">{categories[c.service.category]}</span></td>
                <td><span className="m">{c.ref}</span></td>
                <td>{c.agent ? <span className="row g8"><span className="av" style={{ width: 26, height: 26, fontSize: 10.5 }}>{initials(c.agent.name)}</span>{shortName(c.agent.name)}</span> : <span className="mut">Unassigned</span>}</td>
                <td><RequestBadge r={c} viewer="staff" /></td>
                <td><PayBadge s={payStatus(c.billing, now)} /></td>
                <td className="mut">{fmtAgo(c.updatedAt, now)}</td>
                <td style={{ textAlign: "right" }}><Link className="btn btn-s btn-sm" href={`/agent/cases/${c.ref}`} aria-label={`Open case ${c.ref}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="case-cards">
        {rows.map((c) => (
          <Link key={c.ref} href={`/agent/cases/${c.ref}`} className="card stack g10" style={{ padding: 16, textDecoration: "none", color: "var(--ink)" }}>
            <div className="row between g8"><span className="m mut">{c.ref}</span><RequestBadge r={c} viewer="staff" /></div>
            <div className="stack" style={{ gap: 3 }}><strong style={{ fontSize: 15.5 }}>{c.profile.name}</strong><span className="mut" style={{ fontSize: 13.5 }}>{c.name} · {categories[c.service.category]}</span></div>
            <div className="row between g8" style={{ paddingTop: 10, borderTop: "1px solid var(--line-2)" }}><PayBadge s={payStatus(c.billing, now)} /><span className="mut" style={{ fontSize: 12.5 }}>{c.agent ? shortName(c.agent.name) : "Unassigned"} · {fmtAgo(c.updatedAt, now)}</span></div>
          </Link>
        ))}
      </div>
      {rows.length === 0 && <div className="stack g8" style={{ padding: 40, alignItems: "center", textAlign: "center" }}><strong>No cases match</strong><span className="hint">Try another filter or clear the search.</span></div>}
      <div className="row between" style={{ padding: "12px 16px", borderTop: "1px solid var(--line)" }}><span className="mut" style={{ fontSize: 13.5 }}>Showing {rows.length} of {cases.length}</span></div>
    </section>
  );
}
