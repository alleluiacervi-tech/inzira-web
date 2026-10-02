"use client";
import Link from "next/link";
import { Icon } from "@/components/ui";

export function StatCard({
  title,
  value,
  delta,
  subtext,
  href,
  icon,
  highlight = false,
}: {
  title: string;
  value: string | number;
  delta?: string;
  subtext?: string;
  href?: string;
  icon?: string;
  highlight?: boolean;
}) {
  const content = (
    <div
      className={`console-panel console-panel-body stack g8 ${href ? "c-clickable-card" : ""}`}
      style={{
        padding: "16px 18px",
        borderColor: highlight ? "var(--c-ember-border)" : "var(--c-border)",
        background: highlight ? "var(--c-ember-bg)" : "var(--c-surface)",
        transition: "border-color 0.12s, box-shadow 0.12s",
      }}
    >
      <div className="row between g8">
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--c-text-muted)" }}>{title}</span>
        {icon && <span style={{ color: highlight ? "var(--c-ember)" : "var(--c-text-subtle)" }}><Icon name={icon} size={16} /></span>}
      </div>
      <div className="row between g8" style={{ alignItems: "baseline" }}>
        <span className="console-stat-figure" style={{ color: highlight ? "var(--c-ember)" : "var(--c-text)" }}>
          {value}
        </span>
        {href && <span style={{ fontSize: 12, color: "var(--c-ember)", fontWeight: 500 }}>View →</span>}
      </div>
      {(delta || subtext) && (
        <div className="row g6 wrapx" style={{ fontSize: 12 }}>
          {delta && (
            <span
              style={{
                fontWeight: 600,
                color: delta.startsWith("+") ? "var(--c-green)" : delta.startsWith("-") ? "var(--c-red)" : "var(--c-text-muted)",
              }}
            >
              {delta}
            </span>
          )}
          {subtext && <span style={{ color: "var(--c-text-muted)" }}>{subtext}</span>}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
        {content}
      </Link>
    );
  }

  return content;
}
