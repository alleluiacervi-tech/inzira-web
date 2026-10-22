import { text } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";
import { Icon } from "./ui";

/** The three steps every request goes through, said once for the whole site instead of per service.
 *  "paid": a settled price paid when the request is sent; "quote": sent with a review fee (`fee`, 0 when free) and priced
 *  by an agent; "training": booked, then sessions agreed. */
export type StepsKind = "paid" | "quote" | "training";

export function QuickSteps({ locale, kind = "paid", fee = "" }: { locale: Locale; kind?: StepsKind; fee?: string }) {
  const t = (k: string, vars?: Record<string, string>) => text(locale, `steps.${k}`, vars);
  const steps: [string, string, string][] = kind === "training"
    ? [["calendar", t("bookT"), t("bookD")], ["users", t("datesT"), t("datesD")], ["star", t("learnT"), t("learnD")]]
    : kind === "quote"
      ? [["send", t("sendT"), fee ? t("sendFeeD", { fee }) : t("sendFreeD")], ["card", t("priceT"), t("priceD")], ["check-circle", t("fileT"), t("getD")]]
      : [["card", t("payT"), t("payD")], ["send", t("fileT"), t("fileD")], ["check-circle", t("getT"), t("getD")]];
  return (
    <ol className="qsteps">
      {steps.map(([icon, title, sub], i) => (
        <li key={title}>
          <span className="qsteps-n" aria-hidden="true"><Icon name={icon} size={20} /></span>
          <span className="stack" style={{ gap: 2 }}><strong><span className="sr-only">{i + 1}. </span>{title}</strong><span className="hint">{sub}</span></span>
        </li>
      ))}
    </ol>
  );
}
