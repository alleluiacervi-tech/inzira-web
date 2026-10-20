import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { Receipt } from "@/components/Receipt";
import { text } from "@/lib/i18n/messages";
import { getMyRequest, getPortalLocale } from "@/lib/repo";

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const locale = await getPortalLocale();
  return { title: text(locale, "request.receiptTitle", { ref }) };
}

export default async function ReceiptPage({ params }: { params: Promise<{ ref: string }> }) {
  const locale = await getPortalLocale();
  const r = await getMyRequest((await params).ref);
  if (!r) notFound();
  return (
    <div className="content">
      <div className="row g8 receipt-actions">
        <a className="btn btn-s btn-sm" href={`/portal/requests/${r.ref}`}>{text(locale, "request.view")}</a>
        <PrintButton label={text(locale, "portal.receiptDownload")} />
      </div>
      <Receipt r={r} locale={locale} />
    </div>
  );
}
