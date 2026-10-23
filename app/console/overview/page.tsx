import { NoAccess } from "@/components/PageStates";
import { OverviewView } from "@/components/console/OverviewView";
import { hasAdminAccess } from "@/lib/permissions";
import { OVERVIEW_RANGES, getAdminOverview, getMyPermissions, getStaffUser } from "@/lib/repo";

export const metadata = { title: "Operations Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const [me, perms, { range }] = await Promise.all([getStaffUser("/console/overview"), getMyPermissions(), searchParams]);
  if (!hasAdminAccess(me.role, perms) || !perms.includes("viewAll")) return <NoAccess what="the operations overview" />;

  const days = OVERVIEW_RANGES.find((r) => String(r) === range) ?? 30;
  return <OverviewView overview={await getAdminOverview(days)} name={me.name} />;
}
