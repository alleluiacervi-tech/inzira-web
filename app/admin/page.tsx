import Link from "next/link";
import { FeeBars, FeeTag, Kpi, PageHead } from "@/components/ui";
import { initials } from "@/lib/format";
import { getAdminOverview, getAgentPerformance } from "@/lib/repo";

export default async function AdminHome() {
  const [o, agents] = await Promise.all([getAdminOverview(), getAgentPerformance()]);
  const topCategory = Math.max(...o.byCategory.map(([, v]) => v));
  return (
    <>
      <PageHead title="Operations overview" sub={o.period}>
        <Link className="btn btn-s btn-sm" href="/admin/payments" style={{ height: 40 }}>Payments ledger</Link>
      </PageHead>
      <div className="content">
        <div className="grid cols-4 m-cols-2" style={{ gap: 14 }}>
          <Kpi label="Total customers" value={o.customers.value} delta={o.customers.delta} sub="this month" icon="users" />
          <Kpi label="Active cases" value={String(o.activeCases.value)} sub={`${o.activeCases.needCustomer} waiting on customers`} icon="list" />
          <Kpi label="Completed cases" value={String(o.completed.value)} delta={o.completed.delta} sub="vs August" icon="check" />
          <Kpi label="Pending payments" value={o.pending.value} sub={`${o.pending.invoices} invoices · ${o.pending.overdue} overdue`} icon="card" />
        </div>
        <section className="card rev" aria-labelledby="rev-h">
          <div className="stack g18">
            <h2 id="rev-h" className="d" style={{ fontSize: 18 }}>Revenue &amp; fees</h2>
            <div className="stack g4"><span className="mut" style={{ fontSize: 13, fontWeight: 600 }}>Revenue = our service fees</span><span className="d fee-ours" style={{ fontSize: 38 }}>{o.revenue.ours}</span><span style={{ fontSize: 13, fontWeight: 600, color: "var(--ok)" }}>{o.revenue.delta}</span></div>
            <div className="divider" />
            <div className="row between g12" style={{ fontSize: 14 }}><span className="row g8"><FeeTag kind="official" /> Passed through, not revenue</span><strong className="nowrap">{o.revenue.official}</strong></div>
            <div className="row between g12" style={{ fontSize: 14 }}><span className="mut">Gross collected from customers</span><strong className="nowrap">{o.revenue.gross}</strong></div>
            <p className="hint">Official fees are held in a separate client account and reconciled against institution receipts daily.</p>
          </div>
          <FeeBars height={190} data={o.monthly} />
        </section>
        <div className="grid cols-2" style={{ gap: 20, alignItems: "start" }}>
          <section className="card stack g14" style={{ padding: 22 }} aria-labelledby="cat-h">
            <div className="row between"><h2 id="cat-h" className="d" style={{ fontSize: 18 }}>Active cases by category</h2><span className="mut" style={{ fontSize: 13 }}>{o.activeCases.value} total</span></div>
            {o.byCategory.map(([l, v]) => (
              <div key={l} className="grid" style={{ gridTemplateColumns: "minmax(0, 150px) minmax(0, 1fr) 36px", gap: 12, alignItems: "center", fontSize: 13.5 }}>
                <span style={{ fontWeight: 600 }}>{l}</span>
                <div style={{ height: 12, background: "var(--sand-2)", borderRadius: 2 }} role="img" aria-label={`${l}: ${v} cases`}><div style={{ width: `${Math.round((v / topCategory) * 100)}%`, height: 12, background: "var(--ink)", borderRadius: 2 }} /></div>
                <span style={{ textAlign: "right", fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </section>
          <section className="card" style={{ padding: "22px 22px 8px" }} aria-labelledby="pop-h">
            <div className="row between"><h2 id="pop-h" className="d" style={{ fontSize: 18 }}>Popular services</h2><span className="mut" style={{ fontSize: 13 }}>Requests this month</span></div>
            {o.popular.map(([n, v, c], i) => (
              <div key={n} className="row g12" style={{ padding: "11px 0", borderBottom: "1px solid var(--line-2)" }}>
                <span className="m mut" style={{ width: 20 }}>{String(i + 1).padStart(2, "0")}</span>
                <div className="stack grow" style={{ gap: 2 }}><strong style={{ fontSize: 14 }}>{n}</strong><span className="mut" style={{ fontSize: 12.5 }}>{c}</span></div>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{v}</span>
              </div>
            ))}
          </section>
        </div>
        <section className="card" style={{ overflow: "hidden" }} aria-labelledby="ag-h">
          <div className="card-head"><h2 id="ag-h" className="d" style={{ fontSize: 18 }}>Agent performance</h2><Link className="lnk" href="/admin/roles#people" style={{ fontSize: 14 }}>Manage people →</Link></div>
          <div className="table-wrap"><table>
            <thead><tr><th>Agent</th><th>Active cases</th><th>Completed (Sep)</th><th>Avg. turnaround</th><th>Accepted first time</th><th>Customer rating</th></tr></thead>
            <tbody>{agents.map((a) => (
              <tr key={a.id}><td><span className="row g10"><span className="av" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(a.name)}</span><span className="stack" style={{ gap: 1 }}><strong>{a.name}</strong><span className="mut" style={{ fontSize: 12.5 }}>{a.team}</span></span></span></td><td>{a.active}</td><td>{a.completed}</td><td>{a.turnaround}</td><td>{a.firstTime}</td><td>{a.rating}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      </div>
    </>
  );
}
