"use client";
import { fmtWhen, initials, shortName } from "@/lib/format";
import type { RequestEvent } from "@/lib/types";
import { Icon } from "@/components/ui";

export function Timeline({ events, now }: { events: RequestEvent[]; now?: string }) {
  const currentNow = now || new Date().toISOString();

  if (!events.length) {
    return (
      <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--c-text-muted)", fontSize: 13 }}>
        No activity recorded yet.
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 0, position: "relative", paddingLeft: 12 }}>
      {/* Timeline vertical track */}
      <div
        style={{
          position: "absolute",
          top: 12,
          bottom: 12,
          left: 23,
          width: 2,
          background: "var(--c-border)",
        }}
      />
      {events.map((e, idx) => {
        const isRecent = idx === 0;
        return (
          <div key={`${e.at}-${idx}`} className="row g12" style={{ alignItems: "flex-start", padding: "10px 0", position: "relative", zIndex: 1 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: isRecent ? "var(--c-ember)" : "#e5e7eb",
                color: isRecent ? "#fff" : "#4b5563",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                flexShrink: 0,
                border: "2px solid #fff",
              }}
            >
              {e.by === "system" ? <Icon name="settings" size={12} /> : initials(e.name || "Staff")}
            </div>
            <div className="stack grow" style={{ gap: 2, minWidth: 0, paddingTop: 1 }}>
              <div className="row between g8">
                <strong style={{ fontSize: 13.5, color: "var(--c-text)" }}>{e.title}</strong>
                <span className="tabular-nums" style={{ fontSize: 12, color: "var(--c-text-muted)" }}>
                  {fmtWhen(e.at, currentNow)}
                </span>
              </div>
              <div className="row g8" style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>
                <span>{e.by === "system" ? "System" : e.by === "customer" ? `Customer (${e.name})` : shortName(e.name || "Staff")}</span>
                {e.body && (
                  <>
                    <span>·</span>
                    <span style={{ color: "var(--c-text)" }}>{e.body}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
