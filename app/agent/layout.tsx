import type { Metadata } from "next";
import { ForceEnglish } from "@/components/I18n";
import StaffShell from "@/components/console/StaffShell";
import { getAgent, getMyPermissions, getNavCounts } from "@/lib/repo";

export const metadata: Metadata = {
  title: { default: "Agent workspace", template: "%s · Inzira agent" },
  robots: { index: false },
};

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const [me, perms, counts] = await Promise.all([getAgent(), getMyPermissions(), getNavCounts()]);

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
