"use client";
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fmtDay } from "@/lib/format";

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

/** A small trend for a stat tile: the shape of the period as a soft area, the latest point marked. */
export function Sparkline({ values, label, width = 96, height = 32 }: { values: number[]; label: string; width?: number; height?: number }) {
  const id = useId();
  if (values.length < 2) return null;
  const max = Math.max(...values, 0), min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = (i: number) => 2 + (i / (values.length - 1)) * (width - 6);
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 8);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z`;
  const lx = x(values.length - 1), ly = y(values[values.length - 1]);
  return (
    <svg className="c-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`sp${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--chart-ours)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--chart-ours)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sp${id})`} />
      <path d={line} fill="none" stroke="var(--chart-ours)" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3.2" fill="var(--chart-ours)" stroke="var(--c-surface)" strokeWidth="1.6" />
    </svg>
  );
}

export type DayPoint = { at: string; value: number; prev: number };

/**
 * One measure day by day across the period, with the same days of the period before as a dashed line for comparison.
 * The plot is an SVG stretched to its box (strokes keep their width); labels, dots and the tooltip are HTML so they stay
 * crisp. Hover, touch or the arrow keys move a crosshair; a table view carries the same numbers.
 */
export function DailyTrend({ days, format, title, prevLabel, height = 220 }: { days: DayPoint[]; format: (n: number) => string; title: string; prevLabel: string; height?: number }) {
  const gid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const n = days.length;
  const top = niceMax(Math.max(...days.map((d) => Math.max(d.value, d.prev)), 0));
  const empty = days.every((d) => d.value === 0 && d.prev === 0);
  const W = 1000, H = 1000;
  const px = (i: number) => (n < 2 ? 0 : (i / (n - 1)) * W);
  const py = (v: number) => H - (v / top) * H;
  const path = (key: "value" | "prev") => days.map((d, i) => `${i ? "L" : "M"}${px(i).toFixed(1)} ${py(d[key]).toFixed(1)}`).join(" ");
  const area = `${path("value")} L${W} ${H} L0 ${H} Z`;
  const pct = (i: number) => (n < 2 ? 0 : (i / (n - 1)) * 100);
  // About six date labels, always including the first and the last day.
  const every = Math.max(1, Math.round((n - 1) / 5));
  const labels = days.map((d, i) => i).filter((i) => i % every === 0 && n - 1 - i >= every / 2 || i === n - 1);
  // On a narrow screen only the first, the middle and the last label are kept.
  const mid = labels.slice(1, -1).reduce((best, i) => (Math.abs(i - (n - 1) / 2) < Math.abs(best - (n - 1) / 2) ? i : best), labels[0]);
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || n < 1) return;
    setActive(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((a) => Math.max(0, Math.min(n - 1, (a ?? n - 1) + (e.key === "ArrowRight" ? 1 : -1))));
    } else if (e.key === "Escape") setActive(null);
  };
  const d = active === null ? null : days[active];
  const total = days.reduce((t, x) => t + x.value, 0), prevTotal = days.reduce((t, x) => t + x.prev, 0);

  return (
    <figure className="c-chart c-trend" aria-label={title}>
      <div className="row between g12 wrapx">
        <div className="c-legend" aria-hidden={asTable}>
          <span><i className="c-key-line" />This period</span>
          <span><i className="c-key-line c-key-dash" />{prevLabel}</span>
        </div>
        <button type="button" className="c-btn c-btn-ghost c-btn-sm" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>
      {asTable ? (
        <div className="c-trend-table">
          <table className="console-table compact">
            <thead><tr><th>Day</th><th className="num">This period</th><th className="num">{prevLabel}</th></tr></thead>
            <tbody>{[...days].reverse().map((x) => <tr key={x.at}><td>{fmtDay(x.at)}</td><td className="num">{format(x.value)}</td><td className="num">{format(x.prev)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : empty ? (
        <div className="c-empty" style={{ minHeight: height, justifyContent: "center" }}>
          <strong>Nothing yet in this period</strong>
          <span className="c-caption">Days fill in as the work comes in.</span>
        </div>
      ) : (
        <div className="c-trend-plot" style={{ height }}>
          <div className="c-trend-y" aria-hidden="true">
            {[top, top / 2, 0].map((t) => <span key={t} style={{ top: `${100 - (t / top) * 100}%` }}><b>{format(t)}</b></span>)}
          </div>
          <div
            ref={box}
            className="c-trend-area"
            tabIndex={0}
            role="img"
            aria-label={`${title}. ${format(total)} this period against ${format(prevTotal)} in the ${prevLabel.toLowerCase()}. Use the arrow keys to read each day.`}
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={() => setActive(null)}
            onKeyDown={key}
            onBlur={() => setActive(null)}
          >
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id={`tr${gid}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--chart-ours)" stopOpacity="0.16" />
                  <stop offset="1" stopColor="var(--chart-ours)" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              <path d={path("prev")} fill="none" stroke="var(--c-trend-prev)" strokeWidth="1.6" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              <path d={area} fill={`url(#tr${gid})`} />
              <path className="c-trend-line" d={path("value")} fill="none" stroke="var(--chart-ours)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            {d && active !== null && (
              <>
                <span className="c-trend-cross" style={{ left: `${pct(active)}%` }} />
                <span className="c-trend-dot is-prev" style={{ left: `${pct(active)}%`, top: `${(py(d.prev) / H) * 100}%` }} />
                <span className="c-trend-dot" style={{ left: `${pct(active)}%`, top: `${(py(d.value) / H) * 100}%` }} />
                <div className={`c-tooltip c-trend-tip ${pct(active) > 60 ? "c-tooltip-left" : ""}`} style={{ left: `${pct(active)}%` }} role="status">
                  <span className="c-caption">{fmtDay(d.at)}</span>
                  <span className="c-tip-row"><i className="c-key-line" /><strong>{format(d.value)}</strong><span className="c-caption">this period</span></span>
                  <span className="c-tip-row"><i className="c-key-line c-key-dash" /><strong>{format(d.prev)}</strong><span className="c-caption">{prevLabel.toLowerCase()}</span></span>
                </div>
              </>
            )}
          </div>
          <div className="c-trend-x" aria-hidden="true">
            {labels.map((i) => <span key={i} style={{ left: `${pct(i)}%` }} className={i === 0 ? "is-first" : i === n - 1 ? "is-last" : i === mid ? "is-mid" : undefined}>{fmtDay(days[i].at)}</span>)}
          </div>
        </div>
      )}
    </figure>
  );
}

/** Parts of one whole, as a single bar split in proportion, with a legend that names each part and its value. */
export function ShareBar({ parts, format, label }: { parts: { name: string; value: number; color: string }[]; format: (n: number) => string; label: string }) {
  const total = parts.reduce((t, p) => t + p.value, 0);
  if (!total) return null;
  return (
    <div className="c-share" role="img" aria-label={`${label}: ${parts.map((p) => `${p.name} ${format(p.value)}`).join(", ")}`}>
      <div className="c-share-bar" aria-hidden="true">
        {parts.filter((p) => p.value > 0).map((p) => <span key={p.name} style={{ flexGrow: p.value, background: p.color }} title={`${p.name}: ${format(p.value)}`} />)}
      </div>
      <ul className="c-share-legend" aria-hidden="true">
        {parts.map((p) => (
          <li key={p.name}>
            <i style={{ background: p.color }} />
            <span>{p.name}</span>
            <b className="tnum">{format(p.value)}</b>
            <span className="c-caption tnum">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One measure across a few categories: horizontal bars, value at the tip. */
export function BarList({ rows, unit, format }: { rows: [string, number][]; unit?: [string, string]; format?: (n: number) => string }) {
  const max = Math.max(...rows.map(([, n]) => n), 1);
  return (
    <ul className="c-barlist">
      {rows.map(([name, n]) => (
        <li key={name}>
          <span className="c-barlist-name">{name}</span>
          <span className="c-barlist-track"><span className="c-barlist-bar" style={{ width: `${(n / max) * 100}%` }} /></span>
          <span className="c-barlist-value tnum">{format ? format(n) : n}{unit && <> <span className="c-caption">{n === 1 ? unit[0] : unit[1]}</span></>}</span>
        </li>
      ))}
    </ul>
  );
}
