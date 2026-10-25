import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { Receipt } from "@/components/Receipt";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { getLinkedRequest, ownsRequest } from "@/lib/repo";

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }): Promise<Metadata> {
  const { ref } = await params;
  return { title: text(await getLocale(), "request.receiptTitle", { ref }), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function LinkedReceiptPage({ params }: { params: Promise<{ ref: string }> }) {
  const ref = decodeURIComponent((await params).ref).toUpperCase();
  if (await ownsRequest(ref)) redirect(`/portal/requests/${ref}/receipt`);
  const [r, locale] = await Promise.all([getLinkedRequest(ref), getLocale()]);
  if (!r) redirect(`/r/${ref}`);
  return (
    <main id="main" className="wrap content" style={{ paddingTop: 24, paddingBottom: 64 }}>
      <div className="row g8 receipt-actions">
        <a className="btn btn-s btn-sm" href={`/r/${r.ref}`}>{text(locale, "request.view")}</a>
        <PrintButton label={text(locale, "portal.receiptDownload")} />
      </div>
      <Receipt r={r} locale={locale} />
    </main>
  );
}
