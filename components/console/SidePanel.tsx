"use client";
import { useDialog } from "@/components/useDialog";
import { type ReactNode } from "react";
import { Icon } from "@/components/ui";

export function SidePanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {


  const dialog = useDialog<HTMLDivElement>(open, () => { onClose(); });

  if (!open) return null;

  return (
    <div ref={dialog} className="console-sidepanel-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="console-sidepanel"
        style={{ width: `${width}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="console-panel-header" style={{ position: "sticky", top: 0, background: "var(--c-surface)", zIndex: 10 }}>
          <div className="stack" style={{ gap: 2 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h3>
            {subtitle && <span style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>{subtitle}</span>}
          </div>
          <button
            type="button"
            className="c-btn c-btn-ghost c-btn-sm c-btn-icon"
            onClick={onClose}
            aria-label="Close panel"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="console-panel-body stack g16 grow" style={{ padding: 20 }}>
          {children}
        </div>
        {footer && (
          <div
            style={{
              padding: "14px 20px",
              borderTop: "1px solid var(--c-border)",
              background: "var(--c-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
              position: "sticky",
              bottom: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
