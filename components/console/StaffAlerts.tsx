"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { listMyStaffAlerts, markMyStaffAlertsRead } from "@/app/actions/console";
import { Icon } from "@/components/ui";
import { fmtAgo } from "@/lib/format";
import type { StaffAlert } from "@/lib/types";

/** How often an open console asks for new alerts. Payments should show up while someone is looking at the screen. */
const CHECK_EVERY_MS = 20_000;
const MONEY_ICON = "card";

export function StaffAlerts({ now }: { now: string }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<StaffAlert[]>([]);
  const [unread, setUnread] = useState(0);
  const [money, setMoney] = useState<StaffAlert | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Alerts already on screen. The first load only sets this, so opening the console does not replay old payments.
  const seen = useRef<Set<string> | null>(null);
  const router = useRouter();

  const load = async () => {
    const r = await listMyStaffAlerts().catch(() => null);
    if (!r) return;
    if (seen.current) {
      const fresh = r.alerts.filter((a) => a.unread && !seen.current!.has(a.id));
      // Something changed on a case: lists, badges and the overview catch up without a reload.
      if (fresh.length) router.refresh();
      const paid = fresh.find((a) => a.icon === MONEY_ICON);
      if (paid) setMoney(paid);
    }
    seen.current = new Set(r.alerts.map((a) => a.id));
    setAlerts(r.alerts);
    setUnread(r.unread);
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, CHECK_EVERY_MS);
    const onShow = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onShow); };
  }, []);

  useEffect(() => {
    if (!money) return;
    const id = window.setTimeout(() => setMoney(null), 12_000);
    return () => window.clearTimeout(id);
  }, [money]);

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
      <div aria-live="polite" className="c-pay-toast-slot">
        {money && (
          <div className="c-pay-toast" role="status" data-pay-toast>
            <span className="c-pay-toast-ico" aria-hidden="true"><Icon name="card" size={18} /></span>
            <div className="stack grow" style={{ gap: 2, minWidth: 0 }}>
              <strong className="c-clip-1" style={{ fontSize: 14 }}>{money.title}</strong>
              {money.body && <span className="c-caption c-clip-2">{money.body}</span>}
              <Link href={money.href} className="c-pay-toast-link" onClick={() => { setMoney(null); void markMyStaffAlertsRead([money.id]); }}>Open case →</Link>
            </div>
            <button type="button" className="c-btn c-btn-ghost c-btn-sm c-btn-icon" aria-label="Dismiss" onClick={() => setMoney(null)}><Icon name="x" size={16} /></button>
          </div>
        )}
      </div>
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
