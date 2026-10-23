"use client";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { Sparkline } from "./charts";

export type Kpi = {
  label: string;
  value: string | number;
  href?: string;
  /** Signed change against an earlier period, e.g. "+10 (+50%) vs prev 30d". */
  delta?: string;
  /** For measures where a fall is good news. */
  downIsGood?: boolean;
  sub?: string;
  /** The figure needs attention. */
  alert?: boolean;
  /** Day-by-day values for the small trend. */
  spark?: number[];
  icon?: string;
};

/** "+10 (+50%) vs prev 30d" → the signed change, and what it is compared with. */
function splitDelta(delta: string) {
  const m = delta.match(/^([+\-−]\S*(?: \([^)]*\))?)\s*(.*)$/);
  return m ? { change: m[1], against: m[2], down: /^[-−]/.test(m[1]), flat: /^[+\-−]0(\D|$)/.test(m[1]) } : null;
}

/** The headline measures as one band, divided by hairlines: read across in one glance, each opens its list. */
export function KpiStrip({ items, label }: { items: Kpi[]; label: string }) {
  return (
    <section className="console-panel c-kpis" aria-label={label} style={{ ["--kpi-n" as string]: items.length }}>
      {items.map((k) => {
        const d = k.delta ? splitDelta(k.delta) : null;
        const good = d ? d.down === !!k.downIsGood : false;
        const body = (
          <>
            <span className="c-kpi-label">{k.icon && <Icon name={k.icon} size={15} />}{k.label}</span>
            <span className="c-kpi-row">
              <span className={`c-kpi-value ${k.alert ? "is-alert" : ""}`}>{k.value}</span>
              {k.spark && k.spark.filter((v) => v > 0).length >= 3 && <Sparkline values={k.spark} label={`${k.label}, day by day`} />}
            </span>
            <span className="c-kpi-foot">
              {d ? (
                <>
                  <span className={`c-delta ${d.flat ? "" : good ? "c-delta-good" : "c-delta-bad"}`}>
                    <Icon name={d.down ? "down" : "arrow"} size={11} stroke={2.4} style={d.down ? undefined : { transform: "rotate(-90deg)" }} />
                    {d.change.replace(/^\+/, "")}
                  </span>
                  {d.against && <span>{d.against}</span>}
                </>
              ) : k.delta ? <span>{k.delta}</span> : null}
              {k.sub && <span>{k.sub}</span>}
            </span>
          </>
        );
        return k.href ? (
          <Link key={k.label} href={k.href} className="c-kpi" aria-label={`${k.label}: ${k.value}. Open details`}>{body}</Link>
        ) : (
          <div key={k.label} className="c-kpi">{body}</div>
        );
      })}
    </section>
  );
}
