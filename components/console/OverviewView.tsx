"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui";
import type { QueueItem, Reason } from "@/lib/dashboard";
import { fmtAgo, fmtDay, fmtDayRel, fmtHours, fmtLong, initials, isSameDay, rwf } from "@/lib/format";
import type { AdminOverview, OverviewRange } from "@/lib/repo";
import { BarList, FeeTrendChart, Sparkline } from "./charts";
import { StatCard } from "./StatCard";

type Tone = "red" | "ember" | "amber" | "blue" | "green";

/** How each reason reads in the queue, and where its button goes. */
const REASON: Record<Reason, { label: string; plural: string; short: string; tone: Tone; icon: string; action: string; href: (ref: string) => string }> = {
  reply: { label: "Client replied", plural: "Replies", short: "Replied", tone: "blue", icon: "msg", action: "Reply", href: (ref) => `/console/requests/${ref}#messages` },
  late: { label: "Past target time", plural: "Past target", short: "Late", tone: "red", icon: "clock", action: "Open case", href: (ref) => `/console/requests/${ref}` },
  review: { label: "Documents to check", plural: "Documents", short: "Documents", tone: "green", icon: "file-text", action: "Review", href: (ref) => `/console/requests/${ref}#documents` },
  new: { label: "Waiting to be accepted", plural: "New", short: "New", tone: "ember", icon: "inbox", action: "Accept", href: () => "/console/inbox" },
  followup: { label: "Follow-up due", plural: "Follow-ups", short: "Follow-up", tone: "amber", icon: "calendar", action: "Open case", href: (ref) => `/console/requests/${ref}` },
  payment: { label: "Payment overdue", plural: "Payments", short: "Overdue", tone: "red", icon: "card", action: "Open case", href: (ref) => `/console/requests/${ref}` },
  chase: { label: "Waiting on client 3+ days", plural: "Chase", short: "Chase", tone: "amber", icon: "call", action: "Open case", href: (ref) => `/console/requests/${ref}` },
  receipt: { label: "Official receipt missing", plural: "Receipts", short: "Receipt", tone: "red", icon: "c-tax", action: "Attach", href: (ref) => `/console/requests/${ref}#payments` },
};

/** The line under a reason: how long it has waited, in the words that matter for it. */
function reasonDetail(r: QueueItem["reasons"][number], now: string) {
  switch (r.kind) {
    case "reply": return `${fmtAgo(r.since, now)}${r.detail ? ` · “${r.detail}”` : ""}`;
    case "late": return `Over by ${fmtHours(Number(r.detail) || 0)}`;
    case "review": return Number(r.detail) > 1 ? `${r.detail} files · oldest ${fmtAgo(r.since, now)}` : `${r.detail} · ${fmtAgo(r.since, now)}`;
    case "new": return `Received ${fmtAgo(r.since, now)}`;
    case "followup": return `${isSameDay(r.since, now) ? "Today" : `Missed · ${fmtDayRel(r.since, now)}`}${r.detail ? ` · ${r.detail}` : ""}`;
    case "payment": return `${rwf(Number(r.detail) || 0)} · due ${fmtDay(r.since)}`;
    case "chase": return `Since ${fmtDay(r.since)}${r.detail ? ` · ${r.detail}` : ""}`;
    case "receipt": return "Paid official fee with no receipt on file";
  }
}

const SHOWN = 6;

function DoNext({ queue, unchecked, now }: { queue: QueueItem[]; unchecked: number; now: string }) {
  const [only, setOnly] = useState<Reason | null>(null);
  const [all, setAll] = useState(false);
  const counts = new Map<Reason, number>();
  for (const q of queue) for (const r of q.reasons) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  const chips = (Object.keys(REASON) as Reason[]).filter((k) => counts.get(k));
  // Filtered to one reason, that reason leads the row, so the button does what the chip asked.
  const list = only ? queue.filter((q) => q.reasons.some((r) => r.kind === only)).map((q) => ({ ...q, reasons: [...q.reasons].sort((a, b) => (a.kind === only ? -1 : b.kind === only ? 1 : 0)) })) : queue;
  const shown = all ? list : list.slice(0, SHOWN);

  return (
    <section className="console-panel c-donext" aria-labelledby="donext-title">
      <header className="console-panel-header">
        <div className="stack" style={{ gap: 1 }}>
          <h2 id="donext-title" className="console-section-title">Do next</h2>
          <span className="c-caption">{queue.length ? `${queue.length} ${queue.length === 1 ? "case needs" : "cases need"} someone · most urgent first` : "Nothing is waiting on you"}</span>
        </div>
      </header>
      {chips.length > 1 && (
        <div className="c-chips" role="group" aria-label="Show only">
          <button type="button" className="c-chip" aria-pressed={!only} onClick={() => { setOnly(null); setAll(false); }}>All <b>{queue.length}</b></button>
          {chips.map((k) => (
            <button key={k} type="button" className={`c-chip c-chip-${REASON[k].tone}`} aria-pressed={only === k} onClick={() => { setOnly(only === k ? null : k); setAll(false); }}>
              {REASON[k].plural} <b>{counts.get(k)}</b>
            </button>
          ))}
        </div>
      )}
      {queue.length === 0 ? (
        <div className="c-empty">
          <Icon name="check-circle" size={22} />
          <strong>All clear</strong>
          <span className="c-caption">New requests, client replies and late cases show up here.</span>
        </div>
      ) : (
        <ul className="c-list">
          {shown.map((q, i) => {
            const [lead, ...rest] = q.reasons;
            const m = REASON[lead.kind];
            return (
              <li key={q.ref} className={`c-list-row ${m.tone === "red" ? "c-list-row-alert" : ""}`}>
                <span className={`c-ico-tile c-tone-${m.tone} c-donext-ico`}><Icon name={m.icon} size={15} /></span>
                <div className="stack g4 grow" style={{ minWidth: 0 }}>
                  <div className="row g8 wrapx" style={{ rowGap: 2 }}>
                    <strong className="c-list-name">{m.label}</strong>
                    {rest.map((r) => <span key={r.kind} className={`c-badge c-badge-${REASON[r.kind].tone}`}>{REASON[r.kind].short}</span>)}
                  </div>
                  <span className="c-caption c-clip-2">{reasonDetail(lead, now)}</span>
                  <span className="c-caption">
                    <Link href={`/console/requests/${q.ref}`} className="c-mono-ref c-ref-link">{q.ref}</Link> · {q.client} · {q.service}
                  </span>
                </div>
                {/* Only the top row gets the strong button: it is the one to do first. */}
                <Link href={m.href(q.ref)} className={`c-btn ${i === 0 ? "c-btn-primary" : "c-btn-secondary"} c-btn-sm`}>{m.action}</Link>
              </li>
            );
          })}
        </ul>
      )}
      {(list.length > SHOWN || unchecked > 0) && (
        <footer className="c-panel-foot">
          {list.length > SHOWN && (
            <button type="button" className="c-btn c-btn-ghost c-btn-sm" onClick={() => setAll(!all)} aria-expanded={all}>
              {all ? "Show fewer" : `Show all ${list.length}`}<Icon name="down" size={14} style={all ? { transform: "rotate(180deg)" } : undefined} />
            </button>
          )}
          {unchecked > 0 && (
            <Link href="/admin/services" className="c-caption c-ref-link row g6">
              <Icon name="shield" size={14} />{unchecked} official {unchecked === 1 ? "fee" : "fees"} not yet checked with the institution
            </Link>
          )}
        </footer>
      )}
    </section>
  );
}

function Pipeline({ stages, now }: { stages: AdminOverview["pipeline"]; now: string }) {
  const total = stages.reduce((n, s) => n + s.count, 0);
  return (
    <section className="console-panel" aria-labelledby="pipe-title">
      <header className="console-panel-header">
        <div className="stack" style={{ gap: 1 }}>
          <h2 id="pipe-title" className="console-section-title">Open cases by stage</h2>
          <span className="c-caption">{total} open now · where work is piling up</span>
        </div>
        <Link href="/console/requests?state=open" className="c-btn c-btn-ghost c-btn-sm">All<Icon name="right" size={14} /></Link>
      </header>
      <ol className="c-list">
        {stages.map((s) => (
          <li key={s.stage}>
            <Link href={`/console/requests?stage=${s.stage}`} className="c-attn">
              <span className="stack grow" style={{ gap: 2, minWidth: 0 }}>
                <span className="c-attn-label">{s.label}</span>
                <span className="c-caption">
                  {s.count === 0 ? "Empty" : [
                    s.late ? `${s.late} late` : null,
                    s.onHold ? `${s.onHold} waiting on client` : null,
                    s.oldest ? `oldest ${fmtAgo(s.oldest.since, now).replace(/ ago$/, "")}` : null,
                  ].filter(Boolean).join(" · ")}
                  {s.targetHours > 0 && <> · target {fmtHours(s.targetHours)}</>}
                </span>
              </span>
              <span className={`c-count ${s.late ? "c-tone-red" : s.count ? "c-tone-blue" : "c-tone-neutral"}`}>{s.count}</span>
              <Icon name="right" size={15} style={{ color: "var(--c-text-subtle)" }} />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Panel({ id, title, caption, children, action }: { id: string; title: string; caption: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="console-panel console-panel-body stack g12" aria-labelledby={`${id}-title`}>
      <div className="row between g8" style={{ alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 1 }}>
          <h2 id={`${id}-title`} className="console-section-title">{title}</h2>
          <span className="c-caption">{caption}</span>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const RANGES: OverviewRange[] = [7, 30, 90];

export function OverviewView({ overview: o }: { overview: AdminOverview }) {
  const [more, setMore] = useState(false);
  const revenueTrend = o.monthly.map((m) => m.ours);
  const late = o.needsAttention.slaBreached;
  const solo = o.team.length < 2;

  return (
    <div className="stack g20">
      <div className="c-page-head">
        <div className="stack g4">
          <span className="c-eyebrow">Overview · {fmtLong(o.now)}</span>
          <h1 className="console-page-title">Operations</h1>
          <p className="c-caption" style={{ fontSize: 13.5 }}>
            {o.queue.length === 0
              ? `Nothing is waiting. ${o.activeCases.value} open ${o.activeCases.value === 1 ? "case" : "cases"}.`
              : late
                ? `${late} ${late === 1 ? "case is" : "cases are"} past target time. Start with the red rows.`
                : `${o.queue.length} ${o.queue.length === 1 ? "case needs" : "cases need"} someone today.`}
          </p>
        </div>
        <div className="row g8 wrapx">
          <Link href="/admin/payments" className="c-btn c-btn-secondary"><Icon name="card" size={15} />Payments</Link>
          <Link href="/console/intake" className="c-btn c-btn-primary"><Icon name="plus" size={15} />New request</Link>
        </div>
      </div>

      <div className="c-grid-work">
        <DoNext queue={o.queue} unchecked={o.needsAttention.uncheckedOfficial} now={o.now} />
        <Pipeline stages={o.pipeline} now={o.now} />
      </div>

      <div className="row between g12 wrapx" style={{ marginTop: 8 }}>
        <h2 className="console-section-title" style={{ fontSize: 16 }}>Results · {o.period.toLowerCase()}</h2>
        <nav className="c-segmented" aria-label="Period">
          {RANGES.map((r) => (
            <Link key={r} href={r === 30 ? "/console/overview" : `/console/overview?range=${r}`} aria-current={o.rangeDays === r ? "page" : undefined} scroll={false}>{r} days</Link>
          ))}
        </nav>
      </div>

      <div className="c-grid-stats">
        <StatCard title="Our fees earned" value={o.revenue.ours} delta={o.revenue.delta} icon="card" href="/admin/payments"
          trend={<Sparkline values={revenueTrend} label={`Our fees, last ${revenueTrend.length} months`} />} />
        <StatCard title="Requests opened" value={o.opened.value} delta={o.opened.delta} icon="plus" href="/console/requests" />
        <StatCard title="Completed" value={o.completed.value} delta={o.completed.delta} icon="check" href="/console/requests?stage=completed"
          subtext={o.onTime.pct === null ? undefined : `${o.onTime.pct}% within target`} />
        <StatCard title="Balances due now" value={o.pending.value} icon="clock" href="/console/requests?attention=balance"
          subtext={`${o.pending.invoices} ${o.pending.invoices === 1 ? "case" : "cases"} · ${o.pending.overdue} overdue`} tone={o.pending.overdue ? "red" : undefined} />
      </div>

      <div className="c-grid-main">
        <Panel id="money" title="Money in" caption={`Collected in the ${o.period.toLowerCase()}`}>
          <dl className="c-money">
            <div><dt>Collected</dt><dd>{o.revenue.gross}</dd></div>
            <div><dt>Our fees</dt><dd className="fee-ours">{o.revenue.ours}</dd></div>
            <div><dt>Official fees passed on</dt><dd>{o.revenue.official}</dd></div>
            <div><dt>Refunded</dt><dd>{o.revenue.refundCount ? `${o.revenue.refunds} (${o.revenue.refundCount})` : "None"}</dd></div>
          </dl>
          <div className="c-checkout-rate" data-checkout-rate>
            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
              <span className="c-caption" style={{ fontWeight: 600 }}>Paid at checkout</span>
              <span className="c-caption">
                {o.checkout.started ? `${o.checkout.paid} of ${o.checkout.started} fixed-price requests paid` : "No fixed-price requests started yet"}
                {o.checkout.waiting ? ` · ${o.checkout.waiting} waiting (${o.checkout.waitingValue})` : ""}
              </span>
            </div>
            <Link href="/console/inbox" className="c-checkout-pct" aria-label="See unpaid checkouts in the inbox">{o.checkout.rate === null ? "—" : `${o.checkout.rate}%`}</Link>
          </div>
          {o.revenue.methods.length ? (
            <>
              <span className="c-caption" style={{ fontWeight: 600 }}>By payment method</span>
              <BarList rows={o.revenue.methods} format={(n) => rwf(n)} />
            </>
          ) : <p className="c-caption">No payments in this period.</p>}
        </Panel>
        <Panel id="trend" title="Fees by month" caption="Last 6 months. Only our fee is Inzira revenue.">
          <FeeTrendChart data={o.monthly} />
        </Panel>
      </div>

      <div className="c-grid-3">
        <Panel id="speed" title="Speed" caption={`Cases completed in the ${o.period.toLowerCase()}`}>
          {o.onTime.of ? (
            <dl className="c-money">
              <div><dt>Within target time</dt><dd className={o.onTime.pct! < 80 ? "c-text-red" : undefined}>{o.onTime.pct}%</dd></div>
              <div><dt>Typical time to finish</dt><dd>{o.onTime.medianDays} days</dd></div>
              <div><dt>Completed</dt><dd>{o.onTime.of}</dd></div>
            </dl>
          ) : <p className="c-caption">No cases completed in this period.</p>}
        </Panel>
        <Panel id="src" title="Where requests came from" caption={`New requests, ${o.period.toLowerCase()}`}>
          {o.sources.length ? <BarList rows={o.sources} unit={["request", "requests"]} /> : <p className="c-caption">No new requests in this period.</p>}
        </Panel>
        <Panel id="top" title="Most requested" caption={`New requests, ${o.period.toLowerCase()}`}>
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
        </Panel>
      </div>

      <div>
        <button type="button" className="c-btn c-btn-ghost c-btn-sm" onClick={() => setMore(!more)} aria-expanded={more}>
          {more ? "Hide extra results" : "More results"}<Icon name="down" size={14} style={more ? { transform: "rotate(180deg)" } : undefined} />
        </button>
      </div>
      {more && (
      <div className={solo ? "c-grid-2" : "c-grid-main"}>
        <Panel id="cat" title="Open cases by category" caption="Right now">
          {o.byCategory.length ? <BarList rows={o.byCategory} unit={["case", "cases"]} /> : <p className="c-caption">No open requests.</p>}
        </Panel>
        <Panel id="act" title="Recent activity" caption="Latest changes on any case">
          {o.recentActivity.length ? (
            <ul className="c-feed">
              {o.recentActivity.map((e, i) => (
                <li key={`${e.ref}-${e.at}-${i}`}>
                  <span className="stack grow" style={{ gap: 1, minWidth: 0 }}>
                    <span className="c-list-name c-clip-1">{e.title}</span>
                    <span className="c-caption"><Link href={`/console/requests/${e.ref}`} className="c-mono-ref c-ref-link">{e.ref}</Link> · {e.client}{e.name && e.name !== "System" ? ` · ${e.name}` : ""}</span>
                  </span>
                  <span className="c-caption nowrap">{fmtAgo(e.at, o.now)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="c-caption">Nothing has happened yet.</p>}
        </Panel>
      </div>
      )}

      {!solo && (
        <section className="console-panel" aria-labelledby="team-title">
          <header className="console-panel-header">
            <div className="stack" style={{ gap: 1 }}>
              <h2 id="team-title" className="console-section-title">Team workload</h2>
              <span className="c-caption">Open cases now; completed and turnaround in the {o.period.toLowerCase()}</span>
            </div>
            <Link href="/admin/roles" className="c-btn c-btn-ghost c-btn-sm">Staff &amp; roles<Icon name="right" size={14} /></Link>
          </header>
          <div className="console-table-container" style={{ border: "none", borderRadius: 0 }}>
            <table className="console-table c-cards">
              <thead>
                <tr><th>Person</th><th className="num">Open</th><th className="num">Past target</th><th className="num">Completed</th><th className="num">Typical turnaround</th><th className="num">Accepted first time</th></tr>
              </thead>
              <tbody>
                {o.team.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/console/requests?agent=${a.id}&state=open`} className="row g10 c-ref-link">
                        <span className="c-avatar">{initials(a.name)}</span>
                        <span className="stack" style={{ gap: 1 }}><strong>{a.name}</strong><span className="c-caption">{a.team}</span></span>
                      </Link>
                    </td>
                    <td className="num" data-label="Open">{a.active}</td>
                    <td className="num" data-label="Past target">{a.late ? <span className="c-sla-late">{a.late}</span> : 0}</td>
                    <td className="num" data-label="Completed">{a.completed}</td>
                    <td className="num" data-label="Typical turnaround">{a.turnaround}</td>
                    <td className="num" data-label="Accepted first time">{a.firstTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
