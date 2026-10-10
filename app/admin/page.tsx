import { NoAccess } from "@/components/PageStates";
import { OverviewView } from "@/components/console/OverviewView";
import { hasAdminAccess } from "@/lib/permissions";
import { getAdmin, getAdminOverview, getAgentPerformance, getMyPermissions } from "@/lib/repo";

export const metadata = { title: "Operations overview" };

// The admin layout also checks this, but a layout is not re-run on client-side navigation,
// so every page that reads private data checks for itself.
export default async function AdminHome() {
  const [me, perms] = await Promise.all([getAdmin(), getMyPermissions()]);
  if (!hasAdminAccess(me.role, perms)) return <NoAccess what="the operations overview" />;

  const [overview, performance] = await Promise.all([
    getAdminOverview(),
    getAgentPerformance(),
  ]);

  return <OverviewView overview={overview} performance={performance} />;
}
