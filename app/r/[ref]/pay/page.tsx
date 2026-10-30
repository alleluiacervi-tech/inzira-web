import { paymentExperience } from "@/lib/payments";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PayScreen from "@/components/PayScreen";
import PublicNav from "@/components/PublicNav";
import { Steps } from "@/components/Steps";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { reconcileForScreen } from "@/lib/billing";
import { getLinkedRequest, getWaitingPayment, ownsRequest } from "@/lib/repo";

// startPayment runs under this page and waits on IntouchPay for up to 50 seconds (lib/intouchpay.ts).
export const maxDuration = 60;

export async function generateMetadata(): Promise<Metadata> {
  return { title: text(await getLocale(), "pay.checkoutTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** Paying a request sent without an account: the same screen as the portal's, opened with the request's private link. */
export default async function LinkedPayPage({ params }: { params: Promise<{ ref: string }> }) {
  const ref = decodeURIComponent((await params).ref).toUpperCase();
  if (await ownsRequest(ref)) redirect(`/portal/requests/${ref}/pay`);
  const [r, locale] = await Promise.all([getLinkedRequest(ref), getLocale()]);
  if (!r) redirect(`/r/${ref}`);
  if (r.closed) redirect(`/r/${r.ref}`);
  let waiting = await getWaitingPayment(r.ref);
  if (waiting) {
    const now = await reconcileForScreen(waiting.txId);
    if (now === "paid") redirect(`/r/${r.ref}`);
    if (now !== "pending") waiting = null;
  }
  const t = (path: string, vars?: Record<string, string | number>) => text(locale, path, vars);
  const justPaid = r.checkout === "paid" && r.stage === "received" && (!r.billing.reviewFee || r.billing.quote === "estimate");
  const checkout = !r.closed && (r.checkout === "open" || justPaid);
  const steps = [t("start.about"), t("start.review"), t("start.stepPay")];
  return (
    <>
      <PublicNav />
      <main id="main" className="wrap rq-pay">
        <div className="stack g18 pay-page">
          {checkout && <Steps names={steps} current={2} label={t("start.stepLabel", { n: 3, total: 3, name: steps[2] })} caption={`${t("start.stepOf", { n: 3, total: 3 })} · ${steps[2]}`} />}
          <PayScreen experience={paymentExperience()} reqRef={r.ref} billing={r.billing} phone={r.account.phone} serviceName={r.service.name} contact={r.account.email ?? r.account.phone}
            checkout={checkout} waiting={waiting ?? undefined} base={`/r/${r.ref}`} />
        </div>
      </main>
    </>
  );
}
