import Link from "next/link";
import CaseBoard from "@/components/CaseBoard";
import { Badge, FeeBars, Icon, Kpi, PageHead } from "@/components/ui";
import { FOLLOWUPS } from "@/lib/data";

export default function AgentHome() {
  return (
    <>
      <PageHead title="Good morning, Eric" sub="Wednesday 30 Sep · 34 open cases assigned to you">
        <Link className="btn btn-p btn-sm" href="/agent/cases/INZ-2026-04821" style={{ height: 40 }}><Icon name="plus" size={18} /> New intake</Link>
      </PageHead>
      <div className="content">
        <div className="grid cols-5" style={{ gap: 14 }}>
          <Kpi label="New requests" value="6" sub="2 unassigned" icon="plus" />
          <Kpi label="Pending · with us" value="14" sub="4 due today" icon="edit" />
          <Kpi label="Awaiting customer" value="5" sub="oldest 3 days" icon="user" valueColor="var(--ember-deep)" />
          <Kpi label="Processing · institution" value="11" sub="2 past typical time" icon="clock" />
          <Kpi label="Completed · this week" value="23" delta="+6" sub="vs last week" icon="check" />
        </div>
        <div className="split">
          <section className="card stack g16" style={{ padding: 20 }} aria-labelledby="fees-h">
            <div className="row between g16 wrapx" style={{ alignItems: "flex-start" }}>
              <div className="stack g4"><h2 id="fees-h" className="d" style={{ fontSize: 18 }}>Service fees — my cases</h2><span className="mut" style={{ fontSize: 13 }}>Weekly, September 2026</span></div>
              <div className="row g28">
                <div className="stack" style={{ gap: 2 }}><span className="mut" style={{ fontSize: 12, fontWeight: 600 }}>Our fees</span><span className="d fee-ours" style={{ fontSize: 22 }}>RWF 1.24M</span></div>
                <div className="stack" style={{ gap: 2 }}><span className="mut" style={{ fontSize: 12, fontWeight: 600 }}>Official, passed through</span><span className="d" style={{ fontSize: 22 }}>RWF 186.5k</span></div>
              </div>
            </div>
            <FeeBars height={150} data={[{ label: "1–7 Sep", official: 38, ours: 262 }, { label: "8–14", official: 41, ours: 298 }, { label: "15–21", official: 52, ours: 331 }, { label: "22–28", official: 44, ours: 305 }, { label: "29–30", official: 11, ours: 44 }]} />
          </section>
          <section className="card" style={{ padding: "18px 20px 6px" }} aria-labelledby="fu-h">
            <h2 id="fu-h" className="d" style={{ fontSize: 18, paddingBottom: 6 }}>Today’s follow-ups</h2>
            {FOLLOWUPS.map((f) => (
              <Link key={f.ref} href={`/agent/cases/${f.ref}`} className="row g14" style={{ padding: "12px 0", borderBottom: "1px solid var(--line-2)", alignItems: "flex-start", textDecoration: "none", color: "var(--ink)" }}>
                <span className="m" style={{ fontSize: 13, width: 44, paddingTop: 2 }}>{f.time}</span>
                <div className="stack g4 grow"><strong style={{ fontSize: 14 }}>{f.customer}</strong><span className="mut" style={{ fontSize: 13, lineHeight: 1.4 }}>{f.what}</span></div>
                <Badge k={f.status} />
              </Link>
            ))}
          </section>
        </div>
        <CaseBoard />
      </div>
    </>
  );
}
