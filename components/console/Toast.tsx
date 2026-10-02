"use client";
import { useEffect } from "react";
import { Icon } from "@/components/ui";

export function Toast({
  message,
  type = "ok",
  onDismiss,
}: {
  message: string;
  type?: "ok" | "err" | "info";
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 2800);
    return () => clearTimeout(t);
  }, [onDismiss]);

  if (!message) return null;

  return (
    <div className="console-toast-container">
      <div className="console-toast">
        <Icon
          name={type === "ok" ? "check" : type === "err" ? "alert" : "info"}
          size={16}
          color={type === "ok" ? "var(--ok-on-dark)" : type === "err" ? "var(--err-on-dark)" : "var(--info-on-dark)"}
        />
        <span>{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          style={{ background: "none", border: "none", color: "var(--on-dark-muted)", cursor: "pointer", padding: "0 0 0 4px", display: "inline-flex" }}
          aria-label="Dismiss toast"
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}
