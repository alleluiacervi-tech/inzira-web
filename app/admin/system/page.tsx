import { NoAccess } from "@/components/PageStates";
import { StageTargets } from "@/components/console/StageTargets";
import SystemStatus from "@/components/SystemStatus";
import { PageHead } from "@/components/ui";
import { getMyPermissions, listStageTargets } from "@/lib/repo";
import { systemStatus } from "@/lib/system";

export const metadata = { title: "System" };
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!(await getMyPermissions()).includes("manageStaff")) return <><PageHead title="System" /><NoAccess what="system settings" /></>;
  const [{ groups, runs }, targets] = await Promise.all([systemStatus(), listStageTargets()]);
  return (
    <>
      <PageHead title="System" sub="What the site is connected to, and what still needs setting up" />
      <div className="content stack g20">
        <SystemStatus groups={groups} runs={runs} />
        <StageTargets targets={targets} />
      </div>
    </>
  );
}
