"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui";

/** "+10 (+50%) vs prev 30d" → the signed change, and what it is compared with. */
function splitDelta(delta: string) {
  const m = delta.match(/^([+\-−]\S*(?: \([^)]*\))?)\s*(.*)$/);
  return m ? { change: m[1], against: m[2], down: /^[-−]/.test(m[1]) } : null;
}

export function StatCard({
  title,
  value,
  delta,
  subtext,
  href,
  icon,
  tone,
  trend,
  downIsGood = false,
}: {
  title: string;
  value: string | number;
  /** Signed change against an earlier period, e.g. "+10 vs prev 30d". */
  delta?: string;
  subtext?: string;
  href?: string;
  icon?: string;
  /** Colours the figure when it needs attention. */
  tone?: "red";
  /** Optional small chart under the figure (e.g. a Sparkline). */
  trend?: ReactNode;
  /** For measures where a fall is good news (overdue items, refunds). */
  downIsGood?: boolean;
}) {
  const d = delta ? splitDelta(delta) : null;
  const good = d ? d.down === downIsGood : false;
  const body = (
    <>
      <div className="row between g8">
        <span className="c-stat-label">{title}</span>
        {icon && <span className="c-stat-icon"><Icon name={icon} size={16} /></span>}
      </div>
      <div className="row between g8" style={{ alignItems: "flex-end" }}>
        <span className="console-stat-figure" style={tone === "red" ? { color: "var(--c-red)" } : undefined}>{value}</span>
        {trend}
      </div>
      {(d || delta || subtext) && (
        <div className="row g6 wrapx c-caption" style={{ rowGap: 2 }}>
          {d ? (
            <>
              <span className={`c-delta ${d.change.startsWith("+0") || d.change === "0" ? "" : good ? "c-delta-good" : "c-delta-bad"}`}>
                <Icon name={d.down ? "down" : "arrow"} size={11} stroke={2.4} style={d.down ? undefined : { transform: "rotate(-90deg)" }} />
                {d.change.replace(/^\+/, "")}
              </span>
              {d.against && <span>{d.against}</span>}
            </>
          ) : delta ? <span>{delta}</span> : null}
          {subtext && <span>{d || delta ? `· ${subtext}` : subtext}</span>}
        </div>
      )}
    </>
  );

  return href ? (
    <Link href={href} className="console-panel c-stat c-stat-link" aria-label={`${title}: ${value}. Open details`}>{body}</Link>
  ) : (
    <div className="console-panel c-stat">{body}</div>
  );
}
