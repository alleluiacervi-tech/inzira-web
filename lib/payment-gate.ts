// No payment, no work. A request can be checked and quoted for free, but preparing it, submitting it to an
// institution and completing it wait until the whole amount (official fee and ours) has been paid, so Inzira never
// does the work or pays an institution out of its own pocket. A supervisor or the owner can move a request on without
// payment, with a written reason that is kept on the case and in the audit log (app/actions/agent.ts).
// Pure functions, safe to import in the browser.
import { amountDue } from "./status";
import type { Billing, Stage } from "./types";
import { rwf } from "./format";

/** The stages that wait for payment. Moving back to an earlier stage is always allowed. */
export const GATED_STAGES: readonly Stage[] = ["preparing", "institution", "completed"];
export const isGated = (stage: Stage) => GATED_STAGES.includes(stage);

/** Every "not paid" refusal starts with this, so a screen can tell it from other errors and offer the override. */
export const PAYMENT_LOCK = "Payment not received.";

export type PaymentLock = {
  locked: boolean;
  /** What is still to pay, official fee and ours. */
  due: number;
  /** False until the agent has confirmed what the institution charges (or that nothing, or the customer, pays it). */
  feesKnown: boolean;
};

/** Whether the request is waiting for payment. A prompt that is still pending is not payment yet. */
export function paymentLock(b: Billing): PaymentLock {
  const feesKnown = b.official !== null || !!b.officialMode;
  const due = amountDue(b);
  return { locked: !feesKnown || due > 0, due, feesKnown };
}

/** What the refusal says. It begins with PAYMENT_LOCK, and tells the reader who can lift it. */
export function lockMessage(lock: PaymentLock, canOverride: boolean): string {
  const what = !lock.feesKnown
    ? "The fees have not been confirmed and sent to the customer yet."
    : `${rwf(lock.due)} is still due from the customer.`;
  return `${PAYMENT_LOCK} ${what} Preparing, submitting and completing wait until it is paid.${canOverride ? "" : " Ask a supervisor or the owner if this case should go ahead anyway."}`;
}
