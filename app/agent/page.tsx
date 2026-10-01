import Link from "next/link";
import CaseBoard from "@/components/CaseBoard";
import { FeeBars, Icon, Kpi, PageHead, RequestBadge } from "@/components/ui";
import { dayPart, fmtLong, fmtTime, isSameDay } from "@/lib/format";
import { getAgent, getAgentFees, getNow, listCases, listCategories } from "@/lib/repo";
import { isOpen } from "@/lib/status";

const DAY = 864e5;

export default async function AgentHome() {
  const [me, cases, categories, fees, now] = await Promise.all([getAgent(), listCases(), listCategories(), getAgentFees(), getNow()]);
  const open = cases.filter(isOpen);
  const mine = open.filter((c) => c.agentId === me.id);
  const fresh = open.filter((c) => c.stage === "received" && !c.hold);
  const holds = mine.filter((c) => c.hold);
  const oldest = holds.length ? Math.max(...holds.map((c) => Math.floor((Date.parse(now) - Date.parse(c.hold!.since)) / DAY))) : 0;
  const followUps = mine.filter((c) => c.followUp && isSameDay(c.followUp.at, now)).sort((a, b) => Date.parse(a.followUp!.at) - Date.parse(b.followUp!.at));

  return (
    <>
      <PageHead title={`Good ${dayPart(now)}, ${me.name.split(" ")[0]}`} sub={`${fmtLong(now)} · ${mine.length} open cases assigned to you`}>
        <Link className="btn btn-p btn-sm" href="/agent/intake" style={{ height: 40 }}><Icon name="plus" size={18} /> New intake</Link>
      </PageHead>
      <div className="content">
        <div className="grid cols-5" style={{ gap: 14 }}>
          <Kpi label="New requests" value={String(fresh.length)} sub={`${fresh.filter((c) => !c.agentId).length} unassigned`} icon="plus" />
          <Kpi label="With me" value={String(mine.filter((c) => !c.hold && c.stage !== "institution").length)} sub={`${followUps.length} follow-ups today`} icon="edit" />
          <Kpi label="Waiting on customer" value={String(holds.length)} sub={holds.length ? `oldest ${oldest} ${oldest === 1 ? "day" : "days"}` : "none"} icon="user" valueColor={holds.length ? "var(--ember-deep)" : undefined} />
          <Kpi label="With the institution" value={String(mine.filter((c) => c.stage === "institution" && !c.hold).length)} sub="awaiting a decision" icon="clock" />
          <Kpi label="Finished" value={String(cases.filter((c) => c.agentId === me.id && !isOpen(c)).length)} sub="delivered or closed" icon="check" />
        </div>
        <div className="split">
          <section className="card stack g16" style={{ padding: 20 }} aria-labelledby="fees-h">
            <div className="row between g16 wrapx" style={{ alignItems: "flex-start" }}>
              <div className="stack g4"><h2 id="fees-h" className="d" style={{ fontSize: 18 }}>Service fees — my cases</h2><span className="mut" style={{ fontSize: 13 }}>{fees.period}</span></div>
              <div className="row g28">
                <div className="stack" style={{ gap: 2 }}><span className="mut" style={{ fontSize: 12, fontWeight: 600 }}>Our fees</span><span className="d fee-ours" style={{ fontSize: 22 }}>{fees.ours}</span></div>
                <div className="stack" style={{ gap: 2 }}><span className="mut" style={{ fontSize: 12, fontWeight: 600 }}>Official, passed through</span><span className="d" style={{ fontSize: 22 }}>{fees.official}</span></div>
              </div>
            </div>
            <FeeBars height={150} data={fees.weekly} />
          </section>
          <section className="card" style={{ padding: "18px 20px 6px" }} aria-labelledby="fu-h">
            <h2 id="fu-h" className="d" style={{ fontSize: 18, paddingBottom: 6 }}>Today’s follow-ups</h2>
            {followUps.map((c) => (
              <Link key={c.ref} href={`/agent/cases/${c.ref}`} className="row g14" style={{ padding: "12px 0", borderBottom: "1px solid var(--line-2)", alignItems: "flex-start", textDecoration: "none", color: "var(--ink)" }}>
                <span className="m" style={{ fontSize: 13, width: 44, paddingTop: 2 }}>{fmtTime(c.followUp!.at)}</span>
                <div className="stack g4 grow"><strong style={{ fontSize: 14 }}>{c.profile.name}</strong><span className="mut" style={{ fontSize: 13, lineHeight: 1.4 }}>{c.followUp!.what}</span></div>
                <RequestBadge r={c} viewer="staff" />
              </Link>
            ))}
            {followUps.length === 0 && <p className="hint" style={{ padding: "12px 0 18px" }}>No follow-ups due today.</p>}
          </section>
        </div>
        <CaseBoard cases={cases} categories={Object.fromEntries(categories.map((c) => [c.id, c.short]))} me={me.id} now={now} />
      </div>
    </>
  );
}
