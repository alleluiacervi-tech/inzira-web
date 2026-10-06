import type { Metadata } from "next";
import { ForceEnglish } from "@/components/I18n";
import StaffShell from "@/components/console/StaffShell";
import { getAgent, getMyPermissions, loadRequests } from "@/lib/repo";
import { isOpen } from "@/lib/status";

export const metadata: Metadata = {
  title: { default: "Agent workspace", template: "%s · Inzira agent" },
  robots: { index: false },
};

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const [me, perms, cases] = await Promise.all([
    getAgent(),
    getMyPermissions(),
    loadRequests(),
  ]);

  const inboxCount = cases.filter((c) => !c.agentId && c.stage === "received").length;
  const openCasesCount = cases.filter((c) => c.agentId === me.id && isOpen(c)).length;

  return (
    <ForceEnglish><StaffShell
      user={me}
      permissions={perms}
      inboxCount={inboxCount}
      openCasesCount={openCasesCount}
    >
      {children}
    </StaffShell></ForceEnglish>
  );
}
