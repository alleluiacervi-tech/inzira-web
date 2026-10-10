import type { Metadata } from "next";
import { ForceEnglish } from "@/components/I18n";
import StaffShell from "@/components/console/StaffShell";
import { getStaffUser, getMyPermissions, getNavCounts } from "@/lib/repo";

export const metadata: Metadata = {
  title: { default: "Staff console", template: "%s · Inzira staff" },
  robots: { index: false },
};

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const [me, perms, counts] = await Promise.all([getStaffUser(), getMyPermissions(), getNavCounts()]);

  return (
    <ForceEnglish><StaffShell
      user={me}
      permissions={perms}
      inboxCount={counts.inbox}
      openCasesCount={counts.mine}
    >
      {children}
    </StaffShell></ForceEnglish>
  );
}
