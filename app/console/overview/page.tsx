import { NoAccess } from "@/components/PageStates";
import { OverviewView } from "@/components/console/OverviewView";
import { hasAdminAccess } from "@/lib/permissions";
import { getAdminOverview, getAgentPerformance, getMyPermissions, getStaffUser } from "@/lib/repo";

export const metadata = { title: "Operations Overview" };

export default async function OverviewPage() {
  const [me, perms] = await Promise.all([getStaffUser("/console/overview"), getMyPermissions()]);
  if (!hasAdminAccess(me.role, perms)) return <NoAccess what="the operations overview" />;

  const [overview, performance] = await Promise.all([
    getAdminOverview(),
    getAgentPerformance(),
  ]);

  return <OverviewView overview={overview} performance={performance} />;
}
