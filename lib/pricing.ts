// Pay at checkout. When what a customer owes is already settled by the catalogue, the request can ask for payment
// straight away, so there is no waiting for an agent to send a quote. That is true when:
//  - the official fee is settled: nothing is passed through us (no official fee, or the customer pays the institution
//    directly), or the institution's fee is a known amount that Inzira has checked;
//  - our fee is a fixed amount, not worked out per year, month or property (those need an agent to count them).
// Anything else is quoted by an agent first. Pure, safe to import in the browser.
import type { Service } from "./types";

export type CheckoutPrice = { official: number; ours: number; total: number; direct: boolean };

export function checkoutPrice(s: Pick<Service, "official" | "ours" | "oursUnit" | "visible">): CheckoutPrice | null {
  if (s.visible === false || s.oursUnit || !(s.ours > 0)) return null;
  const { mode, amount, verifiedAt } = s.official;
  if (mode === "none") return { official: 0, ours: s.ours, total: s.ours, direct: false };
  if (mode === "direct") return { official: 0, ours: s.ours, total: s.ours, direct: true };
  if (amount !== null && amount !== undefined && verifiedAt) return { official: amount, ours: s.ours, total: amount + s.ours, direct: false };
  return null;
}
