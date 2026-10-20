import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { Receipt } from "@/components/Receipt";
import { getRequest } from "@/lib/repo";

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  return { title: `Receipt ${(await params).ref}` };
}

export default async function StaffReceiptPage({ params }: { params: Promise<{ ref: string }> }) {
  const r = await getRequest((await params).ref);
  if (!r) notFound();
  return (
    <div className="stack g16">
      <div className="row g8 receipt-actions">
        <Link href={`/console/requests/${r.ref}`} className="c-btn c-btn-secondary c-btn-sm">Back to case</Link>
        <PrintButton label="Print / save PDF" className="c-btn c-btn-primary c-btn-sm" />
      </div>
      <Receipt r={r} />
    </div>
  );
}
