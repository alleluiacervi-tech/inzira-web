import { PageHead } from "@/components/ui";
import DocumentCenter from "@/components/DocumentCenter";
import { listMyDocuments } from "@/lib/repo";

export const metadata = { title: "Documents" };
export default async function DocumentsPage() {
  return (
    <>
      <PageHead title="Documents" sub="Everything you’ve shared with us and everything we’ve delivered to you" />
      <div className="content"><DocumentCenter initial={await listMyDocuments()} /></div>
    </>
  );
}
