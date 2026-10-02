"use client";
import { useState } from "react";

/** Monthly fee totals in RWF thousands (10.5 = RWF 10,500), as getAdminOverview returns them. */
export type MonthFees = { label: string; ours: number; official: number };

const fmtK = (k: number) => {
  const rwf = Math.round(k * 1000);
  return rwf >= 1e6 ? `${(rwf / 1e6).toFixed(1).replace(/\.0$/, "")}M` : rwf >= 1e3 ? `${Math.round(rwf / 1e3)}k` : String(rwf);
};
const fmtRwf = (k: number) => `RWF ${Math.round(k * 1000).toLocaleString("en-US")}`;

/** Rounds the axis top up to 1, 2 or 5 × 10ⁿ so ticks land on clean numbers. */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/**
 * Stacked columns: our fee at the baseline (what Inzira earns), official fees passed through on top.
 * Both together are what was collected that month, so stacking is the honest form.
 */
export function FeeTrendChart({ data, height = 200 }: { data: MonthFees[]; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const top = niceMax(Math.max(...data.map((d) => d.ours + d.official), 0));
  const ticks = [0, top / 2, top];
  const empty = data.every((d) => d.ours + d.official === 0);
  const last = data.length - 1;

  return (
    <figure className="c-chart" aria-label="Fees collected per month">
      <div className="row between g12 wrapx">
        <div className="c-legend" aria-hidden={asTable}>
          <span><i className="c-swatch c-swatch-ours" />Our fee (revenue)</span>
          <span><i className="c-swatch c-swatch-official" />Official fees passed through</span>
        </div>
        <button type="button" className="c-btn c-btn-ghost c-btn-sm" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {asTable ? (
        <table className="console-table" style={{ marginTop: 8 }}>
          <thead><tr><th>Month</th><th className="num">Our fee</th><th className="num">Official fees</th><th className="num">Total collected</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}><td>{d.label}</td><td className="num">{fmtRwf(d.ours)}</td><td className="num">{fmtRwf(d.official)}</td><td className="num">{fmtRwf(d.ours + d.official)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : empty ? (
        <div className="c-empty" style={{ minHeight: height, justifyContent: "center" }}>
          <strong>No payments in the last six months</strong>
          <span className="c-caption">Paid requests appear here, split into our fee and official fees.</span>
        </div>
      ) : (
        <div className="c-plot" style={{ minHeight: height }}>
          <div className="c-axis" aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} className="c-tick" style={{ bottom: `${(t / top) * 100}%` }}><b>{fmtK(t)}</b></span>
            ))}
          </div>
          <div className="c-cols">
            {data.map((d, i) => {
              const total = d.ours + d.official;
              const oursH = (d.ours / top) * 100;
              const offH = (d.official / top) * 100;
              return (
                <div
                  key={d.label}
                  className={`c-col ${active === i ? "is-active" : ""}`}
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.label}: our fee ${fmtRwf(d.ours)}, official fees ${fmtRwf(d.official)}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                >
                  <div className="c-stack">
                    {i === last && total > 0 && active !== i && <span className="c-cap-label">{fmtK(total)}</span>}
                    {d.official > 0 && <span className="c-seg c-seg-official" style={{ height: `${offH}%` }} />}
                    {d.ours > 0 && <span className={`c-seg c-seg-ours ${d.official > 0 ? "" : "is-top"}`} style={{ height: `${oursH}%` }} />}
                  </div>
                  <span className="c-col-label">{d.label}</span>
                  {active === i && (
                    <div className={`c-tooltip ${i > data.length / 2 ? "c-tooltip-left" : ""}`} role="presentation">
                      <span className="c-caption">{d.label}</span>
                      <span className="c-tip-row"><i className="c-key c-swatch-ours" /><strong>{fmtRwf(d.ours)}</strong><span className="c-caption">our fee</span></span>
                      <span className="c-tip-row"><i className="c-key c-swatch-official" /><strong>{fmtRwf(d.official)}</strong><span className="c-caption">official</span></span>
                      <span className="c-tip-row c-tip-total"><strong>{fmtRwf(total)}</strong><span className="c-caption">collected</span></span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </figure>
  );
}

/** A small trend line for a stat tile: history in a quiet tone, the latest point in the accent. */
export function Sparkline({ values, label, width = 88, height = 28 }: { values: number[]; label: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 0), min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = (i: number) => 3 + (i / (values.length - 1)) * (width - 6);
  const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const lx = x(values.length - 1), ly = y(values[values.length - 1]);
  return (
    <svg className="c-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={d} fill="none" stroke="var(--line-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="4" fill="var(--chart-ours)" stroke="var(--c-surface)" strokeWidth="2" />
    </svg>
  );
}

/** One measure across a few categories: horizontal bars, value at the tip. */
export function BarList({ rows, unit }: { rows: [string, number][]; unit: [string, string] }) {
  const max = Math.max(...rows.map(([, n]) => n), 1);
  return (
    <ul className="c-barlist">
      {rows.map(([name, n]) => (
        <li key={name}>
          <span className="c-barlist-name">{name}</span>
          <span className="c-barlist-track"><span className="c-barlist-bar" style={{ width: `${(n / max) * 100}%` }} /></span>
          <span className="c-barlist-value tnum">{n} <span className="c-caption">{n === 1 ? unit[0] : unit[1]}</span></span>
        </li>
      ))}
    </ul>
  );
}
