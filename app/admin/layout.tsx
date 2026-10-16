import type { Metadata } from "next";
import { ForceEnglish } from "@/components/I18n";
import StaffShell from "@/components/console/StaffShell";
import { NoAccess } from "@/components/PageStates";
import { hasAdminAccess } from "@/lib/permissions";
import { getAdmin, getMyPermissions, getNavCounts } from "@/lib/repo";

export const metadata: Metadata = {
  title: { default: "Admin console", template: "%s · Inzira admin" },
  robots: { index: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [me, perms, counts] = await Promise.all([getAdmin(), getMyPermissions(), getNavCounts()]);

  const allowed = hasAdminAccess(me.role, perms);

  return (
    <ForceEnglish><StaffShell
      user={me}
      permissions={perms}
      inboxCount={counts.inbox}
      openCasesCount={counts.mine}
      identityCount={counts.identity}
    >
      {allowed ? children : <NoAccess what="the admin console" />}
    </StaffShell></ForceEnglish>
  );
}
