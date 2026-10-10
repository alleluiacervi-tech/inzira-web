import { NoAccess } from "@/components/PageStates";
import { PageHead } from "@/components/ui";
import Intake from "@/components/Intake";
import { WORKS_CASES } from "@/lib/access";
import { getMyPermissions, listServices } from "@/lib/repo";

export const metadata = { title: "New intake" };
export default async function IntakePage() {
  if (!(await getMyPermissions()).includes(WORKS_CASES)) return <><PageHead title="New intake" /><NoAccess what="opening cases" /></>;
  return (
    <>
      <PageHead title="New intake" sub="Open a case for a walk-in, a phone call or a WhatsApp message" />
      <div className="content"><Intake services={await listServices()} /></div>
    </>
  );
}
