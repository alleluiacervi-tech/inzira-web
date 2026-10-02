"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { initials, rwf, shortName } from "@/lib/format";
import { StatCard } from "./StatCard";

export function OverviewView({
  overview,
  performance,
}: {
  overview: any;
  performance: any[];
}) {
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);

  const maxMonthValue = Math.max(
    ...overview.monthly.map((m: any) => (m.official || 0) + (m.ours || 0)),
    1
  );

  return (
    <div className="stack g20">
      {/* 1. "Needs Attention" Block */}
      <div className="stack g10">
        <div className="row between g12">
          <div className="row g6">
            <span style={{ color: "var(--c-amber)" }}><Icon name="alert" size={16} /></span>
            <strong style={{ fontSize: 14 }}>Needs attention</strong>
          </div>
          <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>Actionable items requiring staff response</span>
        </div>

        <div className="grid cols-3 m-cols-2" style={{ gap: 12 }}>
          <Link
            href="/console/inbox"
            className="console-panel row between g10"
            style={{
              padding: "12px 14px",
              textDecoration: "none",
              color: "inherit",
              borderLeft: overview.needsAttention.unassigned > 0 ? "3px solid var(--c-ember)" : "1px solid var(--c-border)",
            }}
          >
            <div className="stack" style={{ gap: 2 }}>
              <span style={{ fontSize: 12, color: "var(--c-text-muted)", fontWeight: 500 }}>New submissions to assign</span>
              <strong style={{ fontSize: 18, color: overview.needsAttention.unassigned > 0 ? "var(--c-ember)" : "inherit" }}>
                {overview.needsAttention.unassigned}
              </strong>
            </div>
            <Icon name="arrow" size={16} color="var(--c-text-subtle)" />
          </Link>

          <Link
            href="/console/requests?payment=overdue"
            className="console-panel row between g10"
            style={{
              padding: "12px 14px",
              textDecoration: "none",
              color: "inherit",
              borderLeft: overview.needsAttention.overdue > 0 ? "3px solid var(--c-red)" : "1px solid var(--c-border)",
            }}
          >
            <div className="stack" style={{ gap: 2 }}>
              <span style={{ fontSize: 12, color: "var(--c-text-muted)", fontWeight: 500 }}>Overdue payments</span>
              <strong style={{ fontSize: 18, color: overview.needsAttention.overdue > 0 ? "var(--c-red)" : "inherit" }}>
                {overview.needsAttention.overdue}
              </strong>
            </div>
            <Icon name="arrow" size={16} color="var(--c-text-subtle)" />
          </Link>

          <Link
            href="/console/requests?filter=sla_breached"
            className="console-panel row between g10"
            style={{
              padding: "12px 14px",
              textDecoration: "none",
              color: "inherit",
              borderLeft: overview.needsAttention.slaBreached > 0 ? "3px solid var(--c-amber)" : "1px solid var(--c-border)",
            }}
          >
            <div className="stack" style={{ gap: 2 }}>
              <span style={{ fontSize: 12, color: "var(--c-text-muted)", fontWeight: 500 }}>Past target time (SLA)</span>
              <strong style={{ fontSize: 18, color: overview.needsAttention.slaBreached > 0 ? "var(--c-amber)" : "inherit" }}>
                {overview.needsAttention.slaBreached}
              </strong>
            </div>
            <Icon name="arrow" size={16} color="var(--c-text-subtle)" />
          </Link>

          <Link
            href="/console/requests?filter=waiting_3d"
            className="console-panel row between g10"
            style={{
              padding: "12px 14px",
              textDecoration: "none",
              color: "inherit",
              borderLeft: overview.needsAttention.waiting3d > 0 ? "3px solid var(--c-amber)" : "1px solid var(--c-border)",
            }}
          >
            <div className="stack" style={{ gap: 2 }}>
              <span style={{ fontSize: 12, color: "var(--c-text-muted)", fontWeight: 500 }}>Waiting on client &gt; 3 days</span>
              <strong style={{ fontSize: 18, color: overview.needsAttention.waiting3d > 0 ? "var(--c-amber)" : "inherit" }}>
                {overview.needsAttention.waiting3d}
              </strong>
            </div>
            <Icon name="arrow" size={16} color="var(--c-text-subtle)" />
          </Link>

          <Link
            href="/admin/services"
            className="console-panel row between g10"
            style={{
              padding: "12px 14px",
              textDecoration: "none",
              color: "inherit",
              borderLeft: overview.needsAttention.uncheckedOfficial > 0 ? "3px solid var(--c-blue)" : "1px solid var(--c-border)",
            }}
          >
            <div className="stack" style={{ gap: 2 }}>
              <span style={{ fontSize: 12, color: "var(--c-text-muted)", fontWeight: 500 }}>Official fees not checked</span>
              <strong style={{ fontSize: 18, color: overview.needsAttention.uncheckedOfficial > 0 ? "var(--c-blue)" : "inherit" }}>
                {overview.needsAttention.uncheckedOfficial}
              </strong>
            </div>
            <Icon name="arrow" size={16} color="var(--c-text-subtle)" />
          </Link>

          <Link
            href="/console/requests?filter=missing_receipt"
            className="console-panel row between g10"
            style={{
              padding: "12px 14px",
              textDecoration: "none",
              color: "inherit",
              borderLeft: overview.needsAttention.missingReceipts > 0 ? "3px solid var(--c-red)" : "1px solid var(--c-border)",
            }}
          >
            <div className="stack" style={{ gap: 2 }}>
              <span style={{ fontSize: 12, color: "var(--c-text-muted)", fontWeight: 500 }}>Official receipts missing</span>
              <strong style={{ fontSize: 18, color: overview.needsAttention.missingReceipts > 0 ? "var(--c-red)" : "inherit" }}>
                {overview.needsAttention.missingReceipts}
              </strong>
            </div>
            <Icon name="arrow" size={16} color="var(--c-text-subtle)" />
          </Link>
        </div>
      </div>

      {/* 2. Headline StatCards */}
      <div className="grid cols-4 m-cols-2" style={{ gap: 14 }}>
        <StatCard
          title="Inzira Fees Earned"
          value={overview.revenue.ours}
          delta={overview.revenue.delta}
          subtext={`Revenue (${overview.period})`}
          icon="card"
          href="/admin/payments"
          highlight
        />
        <StatCard
          title="Requests Opened"
          value={overview.opened.value}
          delta={overview.opened.delta}
          subtext={`Cases (${overview.period})`}
          icon="plus"
          href="/console/requests"
        />
        <StatCard
          title="Completed Cases"
          value={overview.completed.value}
          delta={overview.completed.delta}
          subtext={`Finished (${overview.period})`}
          icon="check"
          href="/console/requests?stage=completed"
        />
        <StatCard
          title="Balances Due"
          value={overview.pending.value}
          subtext={`${overview.pending.invoices} invoices · ${overview.pending.overdue} overdue`}
          icon="clock"
          href="/console/requests?payment=pending"
        />
      </div>

      {/* 3. Income Trend Chart (Our Fee vs Official Fee Separated) */}
      <div className="console-panel stack g14" style={{ padding: 20 }}>
        <div className="row between g16 wrapx">
          <div className="stack" style={{ gap: 2 }}>
            <h3 className="console-section-title" style={{ margin: 0 }}>Fee breakdown trend (Last 6 Months)</h3>
            <span style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>
              Inzira Assistance Fee (our revenue) vs Passed-through official government fees.
            </span>
          </div>
          <div className="row g16" style={{ fontSize: 12.5 }}>
            <span className="row g6">
              <span style={{ width: 10, height: 10, background: "var(--c-ember)", borderRadius: 2 }} />
              <span>Inzira Fee (Revenue)</span>
            </span>
            <span className="row g6">
              <span style={{ width: 10, height: 10, background: "#9ca3af", borderRadius: 2 }} />
              <span>Official Fee (Passed-through)</span>
            </span>
          </div>
        </div>

        {/* Bar Chart Area */}
        <div style={{ height: 180, display: "flex", alignItems: "flex-end", gap: 24, padding: "16px 0 8px" }}>
          {overview.monthly.map((m: any, idx: number) => {
            const total = (m.official || 0) + (m.ours || 0);
            const oursPct = Math.round(((m.ours || 0) / maxMonthValue) * 100);
            const offPct = Math.round(((m.official || 0) / maxMonthValue) * 100);

            return (
              <div
                key={m.label}
                className="stack grow"
                style={{ height: "100%", justifyContent: "flex-end", alignItems: "center", position: "relative" }}
                onMouseEnter={() => setHoverMonth(idx)}
                onMouseLeave={() => setHoverMonth(null)}
              >
                {/* Hover Tooltip */}
                {hoverMonth === idx && (
                  <div
                    className="console-panel stack g4"
                    style={{
                      position: "absolute",
                      bottom: "105%",
                      zIndex: 20,
                      padding: "8px 10px",
                      fontSize: 11.5,
                      minWidth: 140,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                    }}
                  >
                    <strong>{m.label}</strong>
                    <div className="row between g6">
                      <span style={{ color: "var(--c-ember)" }}>Inzira:</span>
                      <strong className="tabular-nums">RWF {(m.ours * 1000).toLocaleString("en-US")}</strong>
                    </div>
                    <div className="row between g6">
                      <span style={{ color: "#6b7280" }}>Official:</span>
                      <strong className="tabular-nums">RWF {(m.official * 1000).toLocaleString("en-US")}</strong>
                    </div>
                  </div>
                )}

                {/* Stacked Bars */}
                <div style={{ width: 36, display: "flex", flexDirection: "column-reverse", height: "100%", justifyContent: "flex-start", background: "#f3f4f6", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: `${oursPct}%`, background: "var(--c-ember)", width: "100%" }} />
                  <div style={{ height: `${offPct}%`, background: "#9ca3af", width: "100%" }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 500, marginTop: 6, color: "var(--c-text-muted)" }}>
                  {m.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Categorical Breakdown & Agent Workload */}
      <div className="grid cols-2" style={{ gap: 20, alignItems: "start" }}>
        {/* Active Cases by Category */}
        <div className="console-panel stack g14" style={{ padding: 18 }}>
          <h3 className="console-section-title" style={{ margin: 0 }}>Active cases by category</h3>
          <div className="stack g10">
            {overview.byCategory.map(([name, count]: [string, number]) => (
              <div key={name} className="stack g4" style={{ fontSize: 13 }}>
                <div className="row between">
                  <strong>{name}</strong>
                  <span className="tabular-nums">{count} cases</span>
                </div>
                <div style={{ height: 6, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      background: "var(--c-ember)",
                      width: `${Math.round((count / Math.max(overview.activeCases.value, 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Services */}
        <div className="console-panel stack g14" style={{ padding: 18 }}>
          <h3 className="console-section-title" style={{ margin: 0 }}>Top services requested ({overview.period})</h3>
          <div className="stack g8">
            {overview.popular.map(([name, count, cat]: [string, number, string], i: number) => (
              <div key={name} className="row between g12" style={{ padding: "8px 0", borderBottom: "1px solid var(--c-border-subtle)", fontSize: 13 }}>
                <div className="row g8">
                  <span className="tabular-nums mut" style={{ width: 16 }}>{i + 1}.</span>
                  <div className="stack" style={{ gap: 1 }}>
                    <strong>{name}</strong>
                    <span style={{ fontSize: 11.5, color: "var(--c-text-muted)" }}>{cat}</span>
                  </div>
                </div>
                <strong className="tabular-nums">{count}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. Agent Workload Table (Clean, no fake rating or false reconciliation text) */}
      <div className="console-panel stack g0" style={{ overflow: "hidden" }}>
        <div className="console-panel-header">
          <h3 className="console-section-title" style={{ margin: 0 }}>Agent performance &amp; turnaround</h3>
          <Link href="/admin/roles" className="linkish" style={{ fontSize: 13, color: "var(--c-ember)" }}>
            Manage staff &amp; roles →
          </Link>
        </div>

        <div className="console-table-container" style={{ border: "none" }}>
          <table className="console-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th className="num">Active Cases</th>
                <th className="num">Completed (30d)</th>
                <th className="num">Avg. Turnaround</th>
                <th className="num">First-Time Acceptance</th>
              </tr>
            </thead>
            <tbody>
              {performance.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="row g10">
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: "50%",
                          background: "#e5e7eb",
                          color: "#374151",
                          fontSize: 10,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {initials(a.name)}
                      </span>
                      <span className="stack" style={{ gap: 1 }}>
                        <strong>{a.name}</strong>
                        <span style={{ fontSize: 11.5, color: "var(--c-text-muted)" }}>{a.team}</span>
                      </span>
                    </span>
                  </td>
                  <td className="num">{a.active}</td>
                  <td className="num">{a.completed}</td>
                  <td className="num">{a.turnaround}</td>
                  <td className="num">{a.firstTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
