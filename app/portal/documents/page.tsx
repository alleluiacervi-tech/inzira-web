import { PageHead } from "@/components/ui";
import DocumentCenter from "@/components/DocumentCenter";
import { text } from "@/lib/i18n/messages";
import { getPortalLocale, listMyDocuments } from "@/lib/repo";

export async function generateMetadata() {
  return { title: text(await getPortalLocale(), "meta.documentsTitle") };
}
export default async function DocumentsPage() {
  const locale = await getPortalLocale();
  return (
    <>
      <PageHead title={text(locale, "meta.documentsTitle")} sub={text(locale, "portal.docsSub")} />
      <div className="content"><DocumentCenter initial={await listMyDocuments()} /></div>
    </>
  );
}
