import { PageHead } from "@/components/ui";
import DocumentCenter from "@/components/DocumentCenter";
import { DASHBOARD_LOCALE } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { listMyDocuments } from "@/lib/repo";

export async function generateMetadata() {
  return { title: text(DASHBOARD_LOCALE, "meta.documentsTitle") };
}
export default async function DocumentsPage() {
  const locale = DASHBOARD_LOCALE;
  return (
    <>
      <PageHead title={text(locale, "meta.documentsTitle")} sub={text(locale, "portal.docsSub")} />
      <div className="content"><DocumentCenter initial={await listMyDocuments()} /></div>
    </>
  );
}
