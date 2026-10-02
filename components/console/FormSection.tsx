"use client";
import { useEffect, type ReactNode } from "react";

export function FormSection({
  title,
  description,
  isDirty = false,
  isSubmitting = false,
  onSave,
  onReset,
  saveLabel = "Save changes",
  children,
}: {
  title?: string;
  description?: string;
  isDirty?: boolean;
  isSubmitting?: boolean;
  onSave?: () => void;
  onReset?: () => void;
  saveLabel?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return (
    <div className="console-panel stack" style={{ position: "relative" }}>
      {(title || description) && (
        <div className="console-panel-header">
          <div className="stack" style={{ gap: 2 }}>
            {title && <h3 className="console-section-title" style={{ margin: 0 }}>{title}</h3>}
            {description && <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>{description}</span>}
          </div>
        </div>
      )}
      <div className="console-panel-body stack g16">
        {children}
      </div>
      {onSave && isDirty && (
        <div className="console-sticky-save">
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--c-amber)" }}>
            ⚠️ You have unsaved changes.
          </span>
          <div className="row g8">
            {onReset && (
              <button
                type="button"
                className="c-btn c-btn-secondary c-btn-sm"
                onClick={onReset}
                disabled={isSubmitting}
              >
                Discard
              </button>
            )}
            <button
              type="button"
              className="c-btn c-btn-primary c-btn-sm"
              onClick={onSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : saveLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
