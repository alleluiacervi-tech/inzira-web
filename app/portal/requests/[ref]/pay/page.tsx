import { paymentExperience } from "@/lib/payments";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PayScreen from "@/components/PayScreen";
import { Steps } from "@/components/Steps";
import { Alert, Icon } from "@/components/ui";
import { text } from "@/lib/i18n/messages";
import { reconcileForScreen } from "@/lib/billing";
import { getMyRequest, getPortalLocale, getWaitingPayment } from "@/lib/repo";

// startPayment runs under this page and waits on IntouchPay for up to 50 seconds (lib/intouchpay.ts).
export const maxDuration = 60;

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const r = await getMyRequest((await params).ref);
  const locale = await getPortalLocale();
  const title = r?.checkout === "open" ? (r.billing.reviewFee ? "pay.reviewTitle" : "pay.checkoutTitle") : "pay.approve";
  return { title: r ? `${text(locale, title)} · ${r.ref}` : text(locale, "request.missing") };
}

export default async function PayPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ phone?: string }> }) {
  const { ref } = await params;
  // Straight from the request form: the number typed there belonged to another account and was not saved.
  const phoneShared = (await searchParams).phone === "shared";
  const [r, locale] = await Promise.all([getMyRequest(ref), getPortalLocale()]);
  if (!r) notFound();
  if (r.closed) redirect(`/portal/requests/${r.ref}`);
  // A customer who left while a prompt was waiting comes back to that prompt, not to a new one. It is checked first:
  // paid goes back to the request, and one that expired or was declined leaves the screen ready to pay again.
  let waiting = await getWaitingPayment(r.ref);
  if (waiting) {
    const now = await reconcileForScreen(waiting.txId);
    if (now === "paid") redirect(`/portal/requests/${r.ref}`);
    if (now !== "pending") waiting = null;
  }
  const t = (path: string, vars?: Record<string, string | number>) => text(locale, path, vars);
  // A request started at checkout continues the form's steps: details and review are done, paying sends it. Just after
  // paying, the page is read again with the checkout over; it keeps the same frame until an agent starts on it, or, for
  // a review fee, until the quote is sent: paying the quote is an ordinary payment.
  const justPaid = r.checkout === "paid" && r.stage === "received" && (!r.billing.reviewFee || r.billing.quote === "estimate");
  const checkout = !r.closed && (r.checkout === "open" || justPaid);
  const steps = [t("start.about"), t("start.review"), t("start.stepPay")];
  return (
    <div className="stack g18 pay-page">
      {checkout
        ? <Steps names={steps} current={2} label={t("start.stepLabel", { n: 3, total: 3, name: steps[2] })} caption={`${t("start.stepOf", { n: 3, total: 3 })} · ${steps[2]}`} />
        : <Link href={`/portal/requests/${r.ref}`} className="lnk row g6" style={{ fontSize: 14 }}><Icon name="arrow-l" size={16} /> {t("pay.back")}</Link>}
      {phoneShared && <Alert kind="info" title={t("start.phoneSharedTitle")}>{t("start.phoneShared")}</Alert>}
      <PayScreen experience={paymentExperience()} reqRef={r.ref} billing={r.billing} phone={r.account.phone} serviceName={r.service.name} contact={r.account.email ?? r.account.phone}
        checkout={checkout} waiting={waiting ?? undefined} />
    </div>
  );
}
