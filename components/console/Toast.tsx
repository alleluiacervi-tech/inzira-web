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
          color={type === "ok" ? "#4ade80" : type === "err" ? "#f87171" : "#60a5fa"}
        />
        <span>{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "0 0 0 4px", display: "inline-flex" }}
          aria-label="Dismiss toast"
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}
