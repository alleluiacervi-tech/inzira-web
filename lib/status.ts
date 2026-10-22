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
/** The parts of a payment record the sums below read. */
type Paid = { transactions: { status: string; official: number; ours: number }[] };
export function paidSplit(b: Paid) {
  const done = b.transactions.filter((t) => t.status === "paid");
  return { official: done.reduce((n, t) => n + t.official, 0), ours: done.reduce((n, t) => n + t.ours, 0) };
}
/** What a refund sends back: our fee, and the official fee we collected with it (one payment, lib/pricing.ts) as long as
 *  we have not paid it to the institution yet, which an attached official receipt says we have. An official fee already
 *  paid is recovered from the institution, not from us. */
export function refundSplit(b: Paid & { officialReceipt: string }) {
  const paid = paidSplit(b);
  const official = b.officialReceipt === "attached" ? 0 : paid.official;
  return { official, ours: paid.ours, total: official + paid.ours };
}
export function amountDue(b: Billing) {
  const paid = paidSplit(b);
  return Math.max(0, (b.official ?? 0) + b.ours - paid.official - paid.ours);
}
/** What the payment screen charges now. While a quoted request waits at checkout, that is its review fee; otherwise it is
 *  what is still due on fees the agent has confirmed (nothing while they are an estimate). */
export function payableNow(b: Billing, checkoutOpen: boolean): { amount: number; review: boolean } {
  if (checkoutOpen && b.reviewFee) {
    const paid = paidSplit(b);
    return { amount: Math.max(0, b.reviewFee - paid.official - paid.ours), review: true };
  }
  return { amount: b.quote === "estimate" ? 0 : amountDue(b), review: false };
}

export function payStatus(b: Billing, now: string): PayStatus {
  if (b.transactions.some((t) => t.status === "refunded")) return "refunded";
  if (b.transactions.some((t) => t.status === "pending")) return "pending";
  const paid = paidSplit(b);
  const officialKnown = b.official !== null || !!b.officialMode;
  if (officialKnown && amountDue(b) === 0) return "paid";
  // A review fee paid on a request still being quoted leaves it "to be confirmed", not part-paid.
  if (b.quote === "estimate") return "quote";
  if (paid.official + paid.ours > 0) return "part";
  if (b.dueAt && Date.parse(now) > Date.parse(b.dueAt)) return "overdue";
  return "unpaid";
}
