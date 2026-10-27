import Link from "next/link";
import { NoAccess } from "@/components/PageStates";
import { Icon, PageHead } from "@/components/ui";
import ReplaceTool from "@/components/ReplaceTool";
import { getMyPermissions } from "@/lib/repo";

export const metadata = { title: "Find and replace · Kinyarwanda text" };

export default async function Page() {
  if (!(await getMyPermissions()).includes("editContent")) return <><PageHead title="Find and replace" /><NoAccess what="editing Kinyarwanda text" /></>;
  return (
    <>
      <PageHead title="Find and replace" sub="Make one word or phrase consistent across all the Kinyarwanda · you review every change before it is made" />
      <div className="content">
        <div className="row g8 wrapx"><Link className="btn btn-g btn-sm" href="/admin/content"><Icon name="arrow-l" size={16} /> All text</Link></div>
        <ReplaceTool />
      </div>
    </>
  );
}
