import AuditLog from "@/components/AuditLog";
import { NoAccess } from "@/components/PageStates";
import { PageHead } from "@/components/ui";
import { getMyPermissions, listAudit } from "@/lib/repo";

export const metadata = { title: "Audit logs" };
export default async function Page() {
  if (!(await getMyPermissions()).includes("viewAudit")) return <><PageHead title="Audit logs" /><NoAccess what="the audit log" /></>;
  return (
    <>
      <PageHead title="Audit logs" sub="Every view, change and payment, newest first" />
      <div className="content"><AuditLog entries={await listAudit()} /></div>
    </>
  );
}
