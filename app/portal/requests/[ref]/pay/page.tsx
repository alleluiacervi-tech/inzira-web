import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PayScreen from "@/components/PayScreen";
import { Icon } from "@/components/ui";
import { text } from "@/lib/i18n/messages";
import { reconcileForScreen } from "@/lib/billing";
import { getMyRequest, getPortalLocale, getWaitingPayment } from "@/lib/repo";

// startPayment runs under this page and waits on IntouchPay for up to 50 seconds (lib/intouchpay.ts).
export const maxDuration = 60;

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const r = await getMyRequest((await params).ref);
  const locale = await getPortalLocale();
  return { title: r ? `${text(locale, "pay.approve")} · ${r.ref}` : text(locale, "request.missing") };
}

export default async function PayPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const [r, locale] = await Promise.all([getMyRequest(ref), getPortalLocale()]);
  if (!r) notFound();
  // A customer who left while a prompt was waiting comes back to that prompt, not to a new one. It is checked first:
  // paid goes back to the request, and one that expired or was declined leaves the screen ready to pay again.
  let waiting = await getWaitingPayment(r.ref);
  if (waiting) {
    const now = await reconcileForScreen(waiting.txId);
    if (now === "paid") redirect(`/portal/requests/${r.ref}`);
    if (now !== "pending") waiting = null;
  }
  const t = (path: string) => text(locale, path);
  return (
    <div className="stack g18" style={{ maxWidth: 520, margin: "0 auto", padding: "28px 0 80px" }}>
      <Link href={`/portal/requests/${r.ref}`} className="lnk row g6" style={{ fontSize: 14 }}><Icon name="arrow-l" size={16} /> {t("pay.back")}</Link>
      <PayScreen reqRef={r.ref} billing={r.billing} phone={r.account.phone} serviceName={r.service.name} waiting={waiting ?? undefined} />
    </div>
  );
}
