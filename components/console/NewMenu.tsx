"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";

export function NewMenu({
  onOpenNewClient,
  onOpenRecordPayment,
}: {
  onOpenNewClient?: () => void;
  onOpenRecordPayment?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      window.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      <button
        type="button"
        className="c-btn c-btn-primary c-btn-sm"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <Icon name="plus" size={15} />
        <span>New</span>
        <Icon name="down" size={13} />
      </button>

      {open && (
        <div
          className="console-panel stack g4"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: 6,
            width: 210,
            padding: 6,
            zIndex: 40,
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <Link
            href="/console/intake"
            className="row g10 console-nav-item"
            style={{ margin: 0, padding: "8px 10px" }}
            onClick={() => setOpen(false)}
          >
            <Icon name="plus" size={16} />
            <span>Open request / intake</span>
          </Link>
          {onOpenNewClient && (
            <button
              type="button"
              className="row g10 console-nav-item linkish"
              style={{ width: "100%", margin: 0, padding: "8px 10px", textAlign: "left" }}
              onClick={() => { setOpen(false); onOpenNewClient(); }}
            >
              <Icon name="user" size={16} />
              <span>Add new client</span>
            </button>
          )}
          {onOpenRecordPayment && (
            <button
              type="button"
              className="row g10 console-nav-item linkish"
              style={{ width: "100%", margin: 0, padding: "8px 10px", textAlign: "left" }}
              onClick={() => { setOpen(false); onOpenRecordPayment(); }}
            >
              <Icon name="card" size={16} />
              <span>Record payment by hand</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
