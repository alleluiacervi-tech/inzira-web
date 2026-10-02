"use client";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { initials } from "@/lib/format";
import { BarList, FeeTrendChart, Sparkline, type MonthFees } from "./charts";
import { StatCard } from "./StatCard";

type Attention = { unassigned: number; overdue: number; slaBreached: number; waiting3d: number; uncheckedOfficial: number; missingReceipts: number };
type Severity = "red" | "ember" | "amber" | "blue";

/** Most serious first: money and compliance, then customers kept waiting, then housekeeping. */
const ATTENTION: { key: keyof Attention; label: string; hint: string; href: string; severity: Severity; icon: string }[] = [
  { key: "missingReceipts", label: "Official receipts missing", hint: "Paid official fees with no receipt on file", href: "/console/requests?filter=missing_receipt", severity: "red", icon: "c-tax" },
  { key: "overdue", label: "Overdue payments", hint: "Customers past their payment date", href: "/console/requests?payment=overdue", severity: "red", icon: "card" },
  { key: "slaBreached", label: "Past target time (SLA)", hint: "Cases over their stage target", href: "/console/requests?filter=sla_breached", severity: "amber", icon: "clock" },
  { key: "unassigned", label: "New submissions to assign", hint: "Requests with no agent yet", href: "/console/inbox", severity: "ember", icon: "inbox" },
  { key: "waiting3d", label: "Waiting on client > 3 days", hint: "Worth a reminder call", href: "/console/requests?filter=waiting_3d", severity: "amber", icon: "users" },
  { key: "uncheckedOfficial", label: "Official fees not checked", hint: "Catalogue prices to confirm with institutions", href: "/admin/services", severity: "blue", icon: "shield" },
];
const RANK: Record<Severity, number> = { red: 0, ember: 1, amber: 2, blue: 3 };

type Overview = {
  period: string;
  needsAttention: Attention;
  revenue: { ours: string; delta: string };
  opened: { value: number; delta: string };
  completed: { value: number; delta: string };
  pending: { value: string; invoices: number; overdue: number };
  monthly: MonthFees[];
  byCategory: [string, number][];
  popular: [string, number, string][];
};
type AgentRow = { id: string; name: string; team: string; active: number; completed: number; turnaround: string; firstTime: string };

function NeedsAttention({ counts }: { counts: Attention }) {
  const items = [...ATTENTION].sort((a, b) => (counts[b.key] > 0 ? 1 : 0) - (counts[a.key] > 0 ? 1 : 0) || RANK[a.severity] - RANK[b.severity] || counts[b.key] - counts[a.key]);
  const open = items.filter((i) => counts[i.key] > 0).length;
  return (
    <section className="console-panel" aria-labelledby="attention-title">
      <header className="console-panel-header">
        <div className="stack" style={{ gap: 1 }}>
          <h2 id="attention-title" className="console-section-title">Needs attention</h2>
          <span className="c-caption">{open ? `${open} of ${items.length} checks need someone` : "All clear — nothing is waiting on staff"}</span>
        </div>
      </header>
      <ul className="c-list">
        {items.map((i) => {
          const n = counts[i.key];
          return (
            <li key={i.key}>
              <Link href={i.href} className={`c-attn ${n ? "" : "is-clear"}`}>
                <span className={`c-ico-tile ${n ? `c-tone-${i.severity}` : "c-tone-neutral"}`}><Icon name={n ? i.icon : "check"} size={15} /></span>
                <span className="stack grow" style={{ gap: 1, minWidth: 0 }}>
                  <span className="c-attn-label">{i.label}</span>
                  <span className="c-caption">{i.hint}</span>
                </span>
                <span className={`c-count ${n ? `c-tone-${i.severity}` : "c-tone-neutral"}`}>{n}</span>
                <Icon name="right" size={15} style={{ color: "var(--c-text-subtle)" }} />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function OverviewView({ overview, performance }: { overview: Overview; performance: AgentRow[] }) {
  const o = overview;
  const revenueTrend = o.monthly.map((m) => m.ours);
  return (
    <div className="stack g20">
      <div className="c-page-head">
        <div className="stack g4">
          <span className="c-eyebrow">Overview · {o.period}</span>
          <h1 className="console-page-title">Operations</h1>
        </div>
        <Link href="/admin/payments" className="c-btn c-btn-secondary"><Icon name="card" size={15} />Payments ledger</Link>
      </div>

      <div className="c-grid-stats">
        <StatCard title="Our fees earned" value={o.revenue.ours} delta={o.revenue.delta} icon="card" href="/admin/payments"
          trend={<Sparkline values={revenueTrend} label={`Our fees, last ${revenueTrend.length} months`} />} />
        <StatCard title="Requests opened" value={o.opened.value} delta={o.opened.delta} icon="plus" href="/console/requests" />
        <StatCard title="Completed" value={o.completed.value} delta={o.completed.delta} icon="check" href="/console/requests?stage=completed" />
        <StatCard title="Balances due" value={o.pending.value} icon="clock" href="/console/requests?payment=pending"
          subtext={`${o.pending.invoices} ${o.pending.invoices === 1 ? "request" : "requests"} · ${o.pending.overdue} overdue`} tone={o.pending.overdue ? "red" : undefined} />
      </div>

      <div className="c-grid-main">
        <NeedsAttention counts={o.needsAttention} />
        <section className="console-panel console-panel-body stack g12" aria-labelledby="trend-title">
          <div className="stack" style={{ gap: 1 }}>
            <h2 id="trend-title" className="console-section-title">Fee breakdown trend</h2>
            <span className="c-caption">What was collected each month, last 6 months. Only our fee is Inzira revenue.</span>
          </div>
          <FeeTrendChart data={o.monthly} />
        </section>
      </div>

      <div className="c-grid-2">
        <section className="console-panel console-panel-body stack g14" aria-labelledby="cat-title">
          <div className="stack" style={{ gap: 1 }}>
            <h2 id="cat-title" className="console-section-title">Active cases by category</h2>
            <span className="c-caption">Open requests right now</span>
          </div>
          {o.byCategory.length ? <BarList rows={o.byCategory} unit={["case", "cases"]} /> : <p className="c-caption">No open requests.</p>}
        </section>
        <section className="console-panel console-panel-body stack g8" aria-labelledby="top-title">
          <div className="stack" style={{ gap: 1 }}>
            <h2 id="top-title" className="console-section-title">Most requested services</h2>
            <span className="c-caption">{o.period}</span>
          </div>
          {o.popular.length ? (
            <ol className="c-ranked">
              {o.popular.map(([name, count, cat]) => (
                <li key={name}>
                  <span className="stack grow" style={{ gap: 1, minWidth: 0 }}><strong className="c-list-name">{name}</strong><span className="c-caption">{cat}</span></span>
                  <span className="tnum c-list-name">{count}</span>
                </li>
              ))}
            </ol>
          ) : <p className="c-caption">No new requests in this period.</p>}
        </section>
      </div>

      <section className="console-panel" aria-labelledby="team-title">
        <header className="console-panel-header">
          <div className="stack" style={{ gap: 1 }}>
            <h2 id="team-title" className="console-section-title">Agent workload &amp; turnaround</h2>
            <span className="c-caption">Completed and turnaround over the last 30 days</span>
          </div>
          <Link href="/admin/roles" className="c-btn c-btn-ghost c-btn-sm">Staff &amp; roles<Icon name="right" size={14} /></Link>
        </header>
        <div className="console-table-container" style={{ border: "none", borderRadius: 0 }}>
          <table className="console-table c-cards">
            <thead>
              <tr><th>Agent</th><th className="num">Active</th><th className="num">Completed</th><th className="num">Avg. turnaround</th><th className="num">Accepted first time</th></tr>
            </thead>
            <tbody>
              {performance.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="row g10">
                      <span className="c-avatar">{initials(a.name)}</span>
                      <span className="stack" style={{ gap: 1 }}><strong>{a.name}</strong><span className="c-caption">{a.team}</span></span>
                    </span>
                  </td>
                  <td className="num" data-label="Active">{a.active}</td>
                  <td className="num" data-label="Completed">{a.completed}</td>
                  <td className="num" data-label="Avg. turnaround">{a.turnaround}</td>
                  <td className="num" data-label="Accepted first time">{a.firstTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
