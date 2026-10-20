"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { listMyStaffAlerts, markMyStaffAlertsRead } from "@/app/actions/console";
import { Icon } from "@/components/ui";
import { fmtAgo } from "@/lib/format";
import type { StaffAlert } from "@/lib/types";

export function StaffAlerts({ now }: { now: string }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<StaffAlert[]>([]);
  const [unread, setUnread] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const load = async () => {
    const r = await listMyStaffAlerts();
    setAlerts(r.alerts);
    setUnread(r.unread);
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 45_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button
        type="button"
        className="c-btn c-btn-ghost c-btn-icon"
        aria-label={unread ? `${unread} unread alerts` : "Staff alerts"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ position: "relative" }}
      >
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="c-alert-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="console-panel c-alert-pop" role="dialog" aria-label="Staff alerts">
          <div className="row between g8" style={{ padding: "10px 12px", borderBottom: "1px solid var(--c-border)" }}>
            <strong style={{ fontSize: 13.5 }}>Alerts</strong>
            {unread > 0 && (
              <button type="button" className="linkish" style={{ fontSize: 12.5 }} onClick={async () => { await markMyStaffAlertsRead(); setUnread(0); setAlerts((xs) => xs.map((a) => ({ ...a, unread: false }))); }}>
                Mark all read
              </button>
            )}
          </div>
          <ul className="c-list" style={{ maxHeight: 360, overflow: "auto" }}>
            {alerts.length === 0 && (
              <li className="c-empty" style={{ padding: 20 }}>
                <span className="c-caption">A client reply, upload or payment on your cases appears here.</span>
              </li>
            )}
            {alerts.map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="c-attn" onClick={() => { setOpen(false); if (a.unread) void markMyStaffAlertsRead([a.id]); }} style={{ alignItems: "flex-start" }}>
                  <span className="stack grow" style={{ gap: 2, minWidth: 0 }}>
                    <span className="c-list-name c-clip-1">{a.title}</span>
                    {a.body && <span className="c-caption c-clip-2">{a.body}</span>}
                    <span className="c-caption">{fmtAgo(a.at, now)}</span>
                  </span>
                  {a.unread && <span className="c-alert-unread" aria-label="Unread" />}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
