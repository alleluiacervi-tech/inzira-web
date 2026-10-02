"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  confirmVariant = "primary",
  requireReason = false,
  reasonLabel = "Reason for this action",
  reasonPlaceholder = "Add details...",
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  confirmVariant?: "primary" | "danger";
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  busy?: boolean;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  if (!open) return null;

  const canSubmit = !requireReason || reason.trim().length > 0;

  return (
    <div className="console-dialog-overlay" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="console-dialog stack" onClick={(e) => e.stopPropagation()}>
        <div className="console-panel-header">
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h3>
          <button
            type="button"
            className="c-btn c-btn-ghost c-btn-sm c-btn-icon"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="console-panel-body stack g14">
          {description && <div style={{ fontSize: 13.5, color: "var(--c-text-muted)", lineHeight: 1.5 }}>{description}</div>}
          {(requireReason || reasonLabel) && (
            <div className="console-form-group">
              <label className="console-label">
                {reasonLabel} {requireReason && <span style={{ color: "var(--c-red)" }}>*</span>}
              </label>
              <textarea
                className="console-textarea"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={reasonPlaceholder}
                disabled={busy}
              />
            </div>
          )}
        </div>
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid var(--c-border)",
            background: "var(--c-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button type="button" className="c-btn c-btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`c-btn ${confirmVariant === "danger" ? "c-btn-danger" : "c-btn-primary"}`}
            disabled={!canSubmit || busy}
            onClick={() => onConfirm(reason)}
          >
            {busy ? "Saving..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
