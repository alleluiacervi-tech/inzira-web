"use client";
import { Icon } from "@/components/ui";
import { DOC_STATUS, PAY_STATUS, requestStatus, type PayStatus, type Viewer } from "@/lib/status";
import type { DocStatus, Progress } from "@/lib/types";

type BadgeTone = "green" | "amber" | "red" | "blue" | "purple" | "neutral" | "ember";

const TONE_MAP: Record<string, { tone: BadgeTone; icon: string }> = {
  ok: { tone: "green", icon: "check" },
  warn: { tone: "amber", icon: "alert" },
  err: { tone: "red", icon: "alert" },
  act: { tone: "ember", icon: "alert" },
  info: { tone: "blue", icon: "info" },
  teal: { tone: "blue", icon: "eye" },
  violet: { tone: "purple", icon: "clock" },
  neutral: { tone: "neutral", icon: "circle" },
};

export function StatusBadge({ tone = "neutral", label, icon }: { tone?: BadgeTone; label: string; icon?: string }) {
  const ico = icon || (tone === "green" ? "check" : tone === "amber" || tone === "red" || tone === "ember" ? "alert" : tone === "blue" ? "clock" : "circle");
  return (
    <span className={`c-badge c-badge-${tone}`}>
      <Icon name={ico} size={13} stroke={2} />
      <span>{label}</span>
    </span>
  );
}

export function RequestStatusBadge({ r, viewer = "staff" }: { r: Pick<Progress, "stage" | "hold" | "closed">; viewer?: Viewer }) {
  const { tone, label } = requestStatus(r, viewer);
  const mapped = TONE_MAP[tone] ?? { tone: "neutral", icon: "circle" };
  return <StatusBadge tone={mapped.tone} label={label} icon={mapped.icon} />;
}

export function DocStatusBadge({ status }: { status: DocStatus | "issued" }) {
  const { tone, label } = DOC_STATUS[status];
  const mapped = TONE_MAP[tone] ?? { tone: "neutral", icon: "circle" };
  return <StatusBadge tone={mapped.tone} label={label} icon={mapped.icon} />;
}

export function PaymentStatusBadge({ status }: { status: PayStatus }) {
  const { tone, label } = PAY_STATUS[status];
  const mapped = TONE_MAP[tone] ?? { tone: "neutral", icon: "circle" };
  return <StatusBadge tone={mapped.tone} label={label} icon={mapped.icon} />;
}
