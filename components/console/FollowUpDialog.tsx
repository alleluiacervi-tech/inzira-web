"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { defaultFollowUpAt, fromKigaliDateTime, kigaliDateTimeParts } from "@/lib/desk";

export function FollowUpDialog({
  open,
  initial,
  busy,
  onClose,
  onSave,
  onClear,
}: {
  open: boolean;
  initial?: { at: string; what: string };
  busy?: boolean;
  onClose: () => void;
  onSave: (at: string, what: string) => void;
  onClear?: () => void;
}) {
  const seed = initial ?? { at: defaultFollowUpAt(), what: "" };
  const parts = kigaliDateTimeParts(seed.at);
  const [date, setDate] = useState(parts.date);
  const [time, setTime] = useState(parts.time);
  const [what, setWhat] = useState(seed.what);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const p = kigaliDateTimeParts(initial?.at ?? defaultFollowUpAt());
    setDate(p.date); setTime(p.time); setWhat(initial?.what ?? ""); setError("");
  }, [open, initial?.at, initial?.what]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="console-dialog-overlay" onClick={() => !busy && onClose()}>
      <div className="console-dialog stack g14" style={{ padding: 18, maxWidth: 420 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fu-t">
        <div className="row between">
          <h3 id="fu-t" style={{ margin: 0, fontSize: 16 }}>Remind me</h3>
          <button type="button" className="c-btn c-btn-ghost c-btn-icon c-btn-sm" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <p className="c-caption" style={{ margin: 0 }}>Kigali time. This shows on My day on that date until you clear it.</p>
        <div className="row g8">
          <div className="console-form-group grow">
            <label className="console-label" htmlFor="fu-d">Date</label>
            <input id="fu-d" className="console-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="console-form-group">
            <label className="console-label" htmlFor="fu-tm">Time</label>
            <input id="fu-tm" className="console-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div className="console-form-group">
          <label className="console-label" htmlFor="fu-w">What to do</label>
          <input id="fu-w" className="console-input" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Call the client, check RDB, chase the receipt…" />
        </div>
        {error && <span className="c-caption" style={{ color: "var(--c-red)" }}>{error}</span>}
        <div className="row g8" style={{ justifyContent: "flex-end" }}>
          {initial && onClear && <button type="button" className="c-btn c-btn-ghost c-btn-sm" disabled={busy} onClick={onClear} style={{ marginRight: "auto" }}>Clear</button>}
          <button type="button" className="c-btn c-btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="c-btn c-btn-primary"
            disabled={busy}
            onClick={() => {
              const at = fromKigaliDateTime(date, time);
              if (!at) { setError("Enter a date and time."); return; }
              if (Date.parse(at) < Date.now() - 60e3) { setError("Pick a time that is still ahead."); return; }
              onSave(at, what.trim() || "Follow up");
            }}
          >
            Save reminder
          </button>
        </div>
      </div>
    </div>
  );
}
