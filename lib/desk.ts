// Pure desk helpers: what to do next, what is still open on a case, follow-up times,
// and the short messages staff send often. No database. Safe on the client.
import { fmtDate, fmtTime, rwf } from "./format";
import { amountDue, payStatus, stageLabel } from "./status";
import type { CustomerRequest, RequestView, Stage } from "./types";

const KIGALI = 2 * 36e5;
const pad = (n: number) => String(n).padStart(2, "0");

export type NextKind =
  | { kind: "closed" }
  | { kind: "completed" }
  | { kind: "hold"; reason: "document" | "information" | "payment" }
  | { kind: "id_correction" }
  | { kind: "docs_rejected"; name: string }
  | { kind: "docs_needed"; n: number }
  | { kind: "pay"; amount: number }
  | { kind: "institution"; officialRef?: string }
  | { kind: "stage"; stage: Stage };

/** The one thing the customer should do, or what Inzira is doing, from live state. */
export function nextSentence(
  r: Pick<CustomerRequest, "closed" | "stage" | "hold" | "idReview" | "documents" | "billing" | "officialRef" | "next">,
  t: (path: string, vars?: Record<string, string | number>) => string,
): string {
  const n = nextKind(r);
  switch (n.kind) {
    case "closed":
    case "completed":
      return r.next;
    case "hold":
      return n.reason === "document" ? t("portal.nextHoldDoc") : n.reason === "information" ? t("portal.nextHoldInfo") : t("portal.nextHoldPay");
    case "id_correction":
      return t("portal.nextIdFix");
    case "docs_rejected":
      return t("portal.nextDocReject", { name: n.name });
    case "docs_needed":
      return t("portal.nextDocs", { n: n.n });
    case "pay":
      return t("portal.nextPay", { amount: rwf(n.amount) });
    case "institution":
      return t("portal.nextInst", { ref: n.officialRef ? t("portal.nextInstRef", { officialRef: n.officialRef }) : "" });
    case "stage":
      return n.stage === "checking" ? t("portal.nextChecking") : n.stage === "preparing" ? t("portal.nextPreparing") : n.stage === "received" ? t("portal.nextReceived") : r.next;
  }
}

export function nextKind(r: Pick<CustomerRequest, "closed" | "stage" | "hold" | "idReview" | "documents" | "billing" | "officialRef">): NextKind {
  if (r.closed) return { kind: "closed" };
  if (r.stage === "completed") return { kind: "completed" };
  if (r.hold) return { kind: "hold", reason: r.hold.reason };
  if (r.idReview === "correction") return { kind: "id_correction" };
  const rejected = r.documents.find((d) => d.status === "rejected");
  if (rejected) return { kind: "docs_rejected", name: rejected.name };
  const needed = r.documents.filter((d) => d.required && (d.status === "required" || d.status === "rejected")).length;
  if (needed) return { kind: "docs_needed", n: needed };
  if (r.billing.quote !== "estimate" && amountDue(r.billing) > 0) return { kind: "pay", amount: amountDue(r.billing) };
  if (r.stage === "institution") return { kind: "institution", officialRef: r.officialRef };
  return { kind: "stage", stage: r.stage };
}

export type DeskCheck = { id: string; label: string; done: boolean; detail: string };

/** Operational ticks on a case, derived from data already on the file. */
export function deskChecks(r: RequestView, now: string): DeskCheck[] {
  const required = r.documents.filter((d) => d.required);
  const approved = required.filter((d) => d.status === "approved").length;
  const needsOfficial = !r.billing.officialMode && r.flow.includes("institution");
  const receiptNeeded = needsOfficial && (r.stage === "preparing" || r.stage === "institution" || r.stage === "completed");
  const pay = payStatus(r.billing, now);
  return [
    {
      id: "docs",
      label: "Required documents",
      done: !required.length || approved === required.length,
      detail: required.length ? `${approved} of ${required.length} approved` : "None required",
    },
    {
      id: "quote",
      label: "Fees sent to the client",
      done: r.billing.quote !== "estimate",
      detail: r.billing.quote === "estimate" ? "Still an estimate" : "Quote sent",
    },
    {
      id: "pay",
      label: "Our fee collected",
      done: pay === "paid" || pay === "refunded" || r.billing.ours === 0,
      detail: pay === "paid" ? "Paid" : pay === "overdue" ? "Overdue" : pay === "quote" ? "Waiting for a quote" : "Not paid yet",
    },
    {
      id: "officialRef",
      label: "Official reference",
      done: !needsOfficial || !!r.officialRef || r.stage === "received" || r.stage === "checking",
      detail: r.officialRef ? r.officialRef : needsOfficial ? "Not recorded" : "Not needed",
    },
    {
      id: "receipt",
      label: "Official receipt on file",
      done: !receiptNeeded || r.billing.officialReceipt === "attached" || r.billing.officialReceipt === "na",
      detail: r.billing.officialReceipt === "attached" ? "Attached" : receiptNeeded ? "Missing" : "Not needed yet",
    },
  ];
}

/** Reassignment from one named agent to another needs a handover line. First assign and unassign do not. */
export const handoverRequired = (fromId: string | null | undefined, toId: string | null | undefined) =>
  !!fromId && !!toId && fromId !== toId;

/** Tomorrow 10:00 in Kigali (UTC+2). */
export function defaultFollowUpAt(nowMs = Date.now()): string {
  const k = new Date(nowMs + KIGALI);
  const utc = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + 1, 10, 0, 0) - KIGALI;
  return new Date(utc).toISOString();
}

export function kigaliDateTimeParts(iso: string): { date: string; time: string } {
  const d = new Date(Date.parse(iso) + KIGALI);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

export function fromKigaliDateTime(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!d || !t) return null;
  const hour = Number(t[1]);
  const minute = Number(t[2]);
  if (hour > 23 || minute > 59) return null;
  const utc = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hour, minute, 0) - KIGALI;
  if (!Number.isFinite(utc)) return null;
  return new Date(utc).toISOString();
}

export const followUpWhen = (iso: string) => `${fmtDate(iso)} · ${fmtTime(iso)} Kigali`;

export const MESSAGE_TEMPLATES: { id: string; label: string; body: string; wait?: boolean }[] = [
  { id: "id-clearer", label: "Clearer ID copy", body: "Please upload a clearer photo of both sides of the national ID. The names and number must be readable.", wait: true },
  { id: "docs-missing", label: "Missing documents", body: "We still need the remaining documents on your request before we can file it. Open the portal and upload what is listed as required.", wait: true },
  { id: "quote-ready", label: "Fees confirmed", body: "The fees are confirmed. Official government fee and our assistance fee are shown separately. Approve and pay in the portal when you are ready." },
  { id: "filed", label: "Filed with the institution", body: "We have submitted the application. We will write again when the institution replies or if they ask for anything else." },
  { id: "waiting-inst", label: "Still with the institution", body: "The institution still has the file. Nothing is needed from you today. We are following it and will update you when there is a decision." },
  { id: "ready", label: "Ready to collect", body: "The document is ready. You can download it from your portal. Thank you for using Inzira." },
];

export function customerWhatsAppUrl(phone: string, ref: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("250") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  if (!/^7\d{8}$/.test(local)) return null;
  const text = encodeURIComponent(`Hello, this is Inzira about ${ref}.`);
  return `https://wa.me/250${local}?text=${text}`;
}

export function stageTargetRows(targets: Record<Stage, number>): { stage: Stage; label: string; hours: number }[] {
  const order: Stage[] = ["received", "checking", "preparing", "institution", "completed"];
  return order.map((stage) => ({ stage, label: stageLabel({}, stage), hours: targets[stage] ?? 0 }));
}
