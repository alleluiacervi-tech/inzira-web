// How a request's state is read and shown. Pure functions, no data access.
// Progress (stage) and blockers (hold) are separate: a hold never moves the request along the
// timeline, it marks the current stage as waiting on the customer.
import { STAGES, type Billing, type DocStatus, type Progress, type Stage, type Tone } from "./types";

export type Viewer = "customer" | "staff";
type Label = { label: string; tone: Tone };
type State = Pick<Progress, "stage" | "hold" | "closed" | "labels">;

export const STAGE_LABEL: Record<Stage, string> = {
  received: "Received",
  checking: "Checking documents",
  preparing: "Preparing",
  institution: "With the institution",
  completed: "Completed",
};
const STAGE_TONE: Record<Stage, Tone> = { received: "neutral", checking: "teal", preparing: "violet", institution: "info", completed: "ok" };

/** The stages a request goes through, in order. */
export const flowOf = (r: Pick<Progress, "flow">): readonly Stage[] => r.flow ?? STAGES;
export const stageLabel = (r: Pick<Progress, "labels">, s: Stage) => r.labels?.[s] ?? STAGE_LABEL[s];
/** Position of the current stage within the request's own flow. */
export const stageIndex = (r: Pick<Progress, "stage" | "flow">) => Math.max(0, flowOf(r).indexOf(r.stage));
export const isOpen = (r: State) => !r.closed && r.stage !== "completed";

/** The one status shown on a badge. Order matters: how it ended, then what blocks it, then where it is. */
export function requestStatus(r: State, viewer: Viewer): Label {
  if (r.closed) return r.closed.kind === "cancelled" ? { label: "Cancelled", tone: "neutral" } : { label: "Rejected by the institution", tone: "err" };
  if (r.hold) return { label: viewer === "customer" ? "Needs your action" : "Waiting on customer", tone: "act" };
  return { label: stageLabel(r, r.stage), tone: STAGE_TONE[r.stage] };
}
/** Short text under the current step of the timeline when it is not simply in progress. */
export function holdLabel(r: State, viewer: Viewer) {
  if (r.closed) return r.closed.kind === "cancelled" ? "Cancelled" : "Rejected";
  if (!r.hold) return "";
  const who = viewer === "customer" ? "waiting on you" : "waiting on customer";
  return r.hold.returned ? `Returned · ${who}` : who[0].toUpperCase() + who.slice(1);
}

export const DOC_STATUS: Record<DocStatus | "issued", Label> = {
  required: { label: "Required", tone: "neutral" },
  received: { label: "Received", tone: "teal" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "err" },
  issued: { label: "Issued", tone: "ok" },
};

// ---------------- payment ----------------
export type PayStatus = "quote" | "unpaid" | "pending" | "part" | "paid" | "overdue" | "refunded";
export const PAY_STATUS: Record<PayStatus, Label> = {
  quote: { label: "Fee to be confirmed", tone: "neutral" },
  unpaid: { label: "Awaiting payment", tone: "warn" },
  pending: { label: "Payment pending", tone: "info" },
  part: { label: "Part-paid", tone: "info" },
  paid: { label: "Paid", tone: "ok" },
  overdue: { label: "Overdue", tone: "err" },
  refunded: { label: "Refunded", tone: "neutral" },
};

/** What has actually been paid, split the same way every price is shown. */
export function paidSplit(b: Billing) {
  const done = b.transactions.filter((t) => t.status === "paid");
  return { official: done.reduce((n, t) => n + t.official, 0), ours: done.reduce((n, t) => n + t.ours, 0) };
}
export function amountDue(b: Billing) {
  const paid = paidSplit(b);
  return Math.max(0, (b.official ?? 0) + b.ours - paid.official - paid.ours);
}
export function payStatus(b: Billing, now: string): PayStatus {
  if (b.transactions.some((t) => t.status === "refunded")) return "refunded";
  if (b.transactions.some((t) => t.status === "pending")) return "pending";
  const paid = paidSplit(b);
  const officialKnown = b.official !== null || !!b.officialMode;
  if (officialKnown && amountDue(b) === 0) return "paid";
  if (paid.official + paid.ours > 0) return "part";
  if (b.quote === "estimate") return "quote";
  if (b.dueAt && Date.parse(now) > Date.parse(b.dueAt)) return "overdue";
  return "unpaid";
}
