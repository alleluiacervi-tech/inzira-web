import { PageHead } from "@/components/ui";
import AuditLog from "@/components/AuditLog";

export const metadata = { title: "Audit logs" };
export default function Page() {
  return (
    <>
      <PageHead title="Audit logs" sub="Immutable record of every view, change and payment" />
      <div className="content"><AuditLog /></div>
    </>
  );
}
