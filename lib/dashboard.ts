// What the staff dashboards compute from a list of cases. Pure: no database, no clock of its own,
// so the overview, My day and the tests all agree on the same numbers for the same `now`.
import { isOnOrBeforeDay } from "./format";
import { amountDue, isOpen, payStatus } from "./status";
import type { RequestView, Service, Stage } from "./types";

const HOUR = 36e5;
const DAY = 864e5;

/** How long a case has been in its current stage against that stage's target, or null when the
 *  stage has no target or no start date. */
export function stageClock(r: RequestView, targets: Record<Stage, number>, now: string) {
  const entered = r.stageDates[r.stage];
  const targetHours = targets[r.stage] ?? 24;
  if (!entered || targetHours <= 0) return null;
  const hours = (Date.parse(now) - Date.parse(entered)) / HOUR;
  return { hoursElapsed: Math.round(hours), targetHours, breached: hours > targetHours, near: hours >= targetHours * 0.75, since: entered };
}

/** Official fees we pass on need the institution's receipt on file once the case is being prepared. */
const receiptMissing = (r: RequestView) => !r.billing.officialMode && r.billing.officialReceipt !== "attached" && (r.stage === "preparing" || r.stage === "institution" || r.stage === "completed");
const waitingDays = (r: RequestView, now: string) => (r.hold ? (Date.parse(now) - Date.parse(r.hold.since)) / DAY : 0);
const lastMessage = (r: RequestView) => r.messages[r.messages.length - 1];
const followUpDue = (r: RequestView, now: string) => !!r.followUp && isOnOrBeforeDay(r.followUp.at, now);
const hasBalance = (r: RequestView) => r.billing.quote !== "estimate" && amountDue(r.billing) > 0;
/** Over its stage target while the next move is ours: a case waiting on the customer is chased instead. */
export const isLate = (r: RequestView, targets: Record<Stage, number>, now: string) => isOpen(r) && !r.hold && !!stageClock(r, targets, now)?.breached;

export function attentionCounts(cases: RequestView[], services: Service[], targets: Record<Stage, number>, now: string) {
  const open = cases.filter(isOpen);
  return {
    unassigned: open.filter((r) => r.stage === "received" && !r.agentId).length,
    overdue: open.filter((r) => payStatus(r.billing, now) === "overdue").length,
    slaBreached: open.filter((r) => isLate(r, targets, now)).length,
    waiting3d: open.filter((r) => waitingDays(r, now) >= 3).length,
    uncheckedOfficial: services.filter((s) => !s.official.mode && !s.official.verifiedAt).length,
    missingReceipts: cases.filter((r) => !r.closed && receiptMissing(r)).length,
  };
}
export type Attention = ReturnType<typeof attentionCounts>;

/** The case filters the dashboards link to, by the name the requests list reads from the URL. */
export const CASE_FILTERS = {
  sla: isLate,
  receipt: (r: RequestView) => !r.closed && receiptMissing(r),
  balance: (r: RequestView) => isOpen(r) && hasBalance(r),
  open: (r: RequestView) => isOpen(r),
};

// ---------------- the work queue ----------------
/** Why a case is in the queue, most urgent first: a customer waiting on us, then late work, then
 *  things to check, then money and reminders. */
export const REASONS = ["reply", "late", "review", "new", "followup", "payment", "chase", "receipt"] as const;
export type Reason = (typeof REASONS)[number];
export type QueueItem = {
  ref: string; client: string; service: string;
  /** The most urgent reason first. */
  reasons: { kind: Reason; since: string; detail?: string }[];
};

export function workQueue(cases: RequestView[], targets: Record<Stage, number>, now: string): QueueItem[] {
  const items: QueueItem[] = [];
  for (const r of cases.filter((c) => !c.closed)) {
    const reasons: QueueItem["reasons"] = [];
    // A finished case stays in the queue only until the institution's receipt is filed.
    if (!isOpen(r)) {
      if (receiptMissing(r)) items.push({ ref: r.ref, client: r.profile.name, service: r.name, reasons: [{ kind: "receipt", since: r.stageDates.completed ?? r.openedAt }] });
      continue;
    }
    const last = lastMessage(r);
    if (last?.by === "customer") reasons.push({ kind: "reply", since: last.at, detail: last.body });
    const clock = stageClock(r, targets, now);
    if (clock && isLate(r, targets, now)) reasons.push({ kind: "late", since: clock.since, detail: `${Math.round(clock.hoursElapsed - clock.targetHours)}` });
    const toReview = r.documents.filter((d) => d.status === "received");
    if (toReview.length) reasons.push({ kind: "review", since: toReview.map((d) => d.file?.uploadedAt ?? r.updatedAt).sort()[0], detail: toReview.length === 1 ? toReview[0].name : String(toReview.length) });
    if (r.stage === "received" && !r.agentId) reasons.push({ kind: "new", since: r.openedAt });
    if (r.followUp && followUpDue(r, now)) reasons.push({ kind: "followup", since: r.followUp.at, detail: r.followUp.what });
    if (payStatus(r.billing, now) === "overdue") reasons.push({ kind: "payment", since: r.billing.dueAt ?? r.openedAt, detail: String(amountDue(r.billing)) });
    if (r.hold && waitingDays(r, now) >= 3) reasons.push({ kind: "chase", since: r.hold.since, detail: r.hold.title });
    if (receiptMissing(r)) reasons.push({ kind: "receipt", since: r.stageDates[r.stage] ?? r.openedAt });
    if (!reasons.length) continue;
    reasons.sort((a, b) => REASONS.indexOf(a.kind) - REASONS.indexOf(b.kind));
    items.push({ ref: r.ref, client: r.profile.name, service: r.name, reasons });
  }
  // Most urgent reason first; within the same reason, whoever has waited longest.
  return items.sort((a, b) => REASONS.indexOf(a.reasons[0].kind) - REASONS.indexOf(b.reasons[0].kind) || Date.parse(a.reasons[0].since) - Date.parse(b.reasons[0].since));
}

// ---------------- performance ----------------
/** A case went back to the institution after a first submission: it was not accepted first time.
 *  Older data recorded this only as a "Returned…" title. */
export const wasReturned = (r: RequestView) => !!r.privacyReturned || r.events.some((e) => e.key === "ev.resubmitted" || e.title.startsWith("Returned"));

/** Hours a whole case is expected to take: the sum of its stage targets. */
export const caseTargetHours = (r: RequestView, targets: Record<Stage, number>) => r.flow.filter((s) => s !== "completed").reduce((n, s) => n + (targets[s] ?? 0), 0);

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Where a case came from: online, or the source staff picked when they opened it at intake. */
export const SOURCES = ["Online", "Walk-in", "Phone call", "WhatsApp", "Referred by a customer"] as const;
export function sourceOf(r: RequestView): string {
  if (r.privacySource) return r.privacySource;
  const opened = r.events.find((e) => e.key === "ev.opened") ?? r.events[r.events.length - 1];
  if (!opened || opened.by === "customer") return "Online";
  return opened.body && (SOURCES as readonly string[]).includes(opened.body) ? opened.body : "Other";
}
