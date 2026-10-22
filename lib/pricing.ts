// Pay at checkout. When what a customer owes is already settled by the catalogue, the request can ask for payment
// straight away, so there is no waiting for an agent to send a quote. That is true when:
//  - the official fee is settled: nothing is passed through us (no official fee, or the customer pays the institution
//    directly), or the institution's fee is a known amount that Inzira has checked;
//  - our fee is a fixed amount, not worked out per year, month or property (those need an agent to count them).
// Anything else is quoted by an agent first, and starts with a small review fee (below). Pure, safe to import in the browser.
import type { Service } from "./types";

/** What a quoted request costs to send: it pays for an agent to check it and work out the fees, and is taken off our fee
 *  when the customer pays the quote. Set NEXT_PUBLIC_REVIEW_FEE_RWF to change it, or to 0 to send quoted requests free. */
export const REVIEW_FEE = (() => {
  const n = Number(process.env.NEXT_PUBLIC_REVIEW_FEE_RWF ?? 1000);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 1000;
})();

export type CheckoutPrice = { official: number; ours: number; total: number; direct: boolean };

export function checkoutPrice(s: Pick<Service, "official" | "ours" | "oursUnit" | "visible">): CheckoutPrice | null {
  if (s.visible === false || s.oursUnit || !(s.ours > 0)) return null;
  const { mode, amount, verifiedAt } = s.official;
  if (mode === "none") return { official: 0, ours: s.ours, total: s.ours, direct: false };
  if (mode === "direct") return { official: 0, ours: s.ours, total: s.ours, direct: true };
  if (amount !== null && amount !== undefined && verifiedAt) return { official: amount, ours: s.ours, total: amount + s.ours, direct: false };
  return null;
}

/** Why staff cannot send fees for this request, or null when they can. A checkout still open has not been paid; one paid
 *  in full at the catalogue price has nothing to quote. One sent with a review fee is quoted as usual. */
export function quoteRefusal(r: { checkout: "none" | "open" | "paid"; reviewFee: number | null }): string | null {
  if (r.checkout === "open") return "The customer has not paid at checkout yet. The request can be quoted once it is paid.";
  if (r.checkout === "paid" && !r.reviewFee) return "This request was priced and paid at checkout, so it has no quote to send.";
  return null;
}

/** The review fee a request for this service starts with: none for a settled price (paid in full instead), and never more
 *  than our own fee, since it is taken off it. Null when nothing is charged to send the request. */
export function reviewFeeFor(s: Pick<Service, "official" | "ours" | "oursUnit" | "visible">, fee = REVIEW_FEE): number | null {
  if (fee <= 0 || checkoutPrice(s)) return null;
  const capped = s.ours > 0 ? Math.min(fee, s.ours) : fee;
  return capped > 0 ? capped : null;
}
