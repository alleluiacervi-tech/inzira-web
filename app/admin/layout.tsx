import type { Metadata } from "next";
import StaffShell from "@/components/console/StaffShell";
import { NoAccess } from "@/components/PageStates";
import { getAdmin, getMyPermissions, loadRequests } from "@/lib/repo";
import { isOpen } from "@/lib/status";

export const metadata: Metadata = {
  title: { default: "Admin console", template: "%s · Inzira admin" },
  robots: { index: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [me, perms, cases] = await Promise.all([
    getAdmin(),
    getMyPermissions(),
    loadRequests(),
  ]);

  const allowed =
    ["editServices", "manageStaff", "refund", "viewAudit"].some((p) =>
      perms.includes(p as never)
    ) ||
    me.role === "Owner" ||
    me.role === "Administrator" ||
    me.role === "Finance";

  const inboxCount = cases.filter((c) => !c.agentId && c.stage === "received").length;
  const openCasesCount = cases.filter((c) => c.agentId === me.id && isOpen(c)).length;

  return (
    <StaffShell
      user={me}
      permissions={perms}
      inboxCount={inboxCount}
      openCasesCount={openCasesCount}
    >
      {allowed ? children : <NoAccess what="the admin console" />}
    </StaffShell>
  );
}
