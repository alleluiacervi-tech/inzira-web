"use client";
import { useState, useTransition } from "react";
import { saveStageTargets } from "@/app/actions/admin";
import { stageTargetRows } from "@/lib/desk";
import type { Stage } from "@/lib/types";

export function StageTargets({ targets }: { targets: Record<Stage, number> }) {
  const [hours, setHours] = useState<Record<Stage, number>>(targets);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState("");
  const rows = stageTargetRows(hours);

  return (
    <section className="console-panel console-panel-body stack g12" aria-labelledby="sla-title">
      <div className="stack" style={{ gap: 2 }}>
        <h2 id="sla-title" className="console-section-title">Stage target times</h2>
        <span className="c-caption">Hours a case may stay in each stage before My day marks it late. Zero means no clock. Times are working hours in the sense of elapsed time, not a business calendar.</span>
      </div>
      <form
        className="stack g12"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveStageTargets(hours);
            setMsg(r.ok ? "Saved." : r.error);
          });
        }}
      >
        <div className="c-grid-stats">
          {rows.map((row) => (
            <label key={row.stage} className="console-form-group">
              <span className="console-label">{row.label}</span>
              <input
                className="console-input"
                inputMode="numeric"
                value={row.hours}
                disabled={busy}
                onChange={(e) => setHours((h) => ({ ...h, [row.stage]: Number(e.target.value.replace(/\D/g, "")) || 0 }))}
              />
            </label>
          ))}
        </div>
        <div className="row g8">
          <button type="submit" className="c-btn c-btn-primary c-btn-sm" disabled={busy}>{busy ? "Saving…" : "Save targets"}</button>
          {msg && <span className="c-caption" role="status">{msg}</span>}
        </div>
      </form>
    </section>
  );
}
