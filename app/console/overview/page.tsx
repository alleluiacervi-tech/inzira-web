import { getAdminOverview, getAgentPerformance } from "@/lib/repo";
import { OverviewView } from "@/components/console/OverviewView";

export const metadata = { title: "Operations Overview" };

export default async function OverviewPage() {
  const [overview, performance] = await Promise.all([
    getAdminOverview(),
    getAgentPerformance(),
  ]);

  return <OverviewView overview={overview} performance={performance} />;
}
