import Link from "next/link";
import { NoAccess } from "@/components/PageStates";
import { PageHead } from "@/components/ui";
import ServiceAdmin from "@/components/ServiceAdmin";
import { contentEntries, primeContent } from "@/lib/content";
import { countRows, serviceFields } from "@/lib/content-fields";
import { getMyPermissions, getServiceDemand, listCategories, listServices } from "@/lib/repo";

export const metadata = { title: "Services & prices" };
export default async function Page({ searchParams }: { searchParams: Promise<{ category?: string; new?: string }> }) {
  const sp = await searchParams;
  const permissions = await getMyPermissions();
  if (!permissions.includes("editServices")) return <><PageHead title="Services & prices" /><NoAccess what="editing services and prices" /></>;
  const [services, categories, demand] = await Promise.all([listServices({ includeHidden: true }), listCategories({ includeHidden: true }), getServiceDemand()]);
  const canTranslate = permissions.includes("editContent");
  // How much of each service still has no Kinyarwanda, for the list.
  const rwStatus: Record<string, { total: number; missing: number }> = {};
  if (canTranslate) {
    await primeContent(true);
    for (const s of services) rwStatus[s.slug] = countRows(serviceFields(s), contentEntries());
  }
  return (
    <>
      <PageHead title="Services & prices" sub="What customers see in the catalogue · prices are always two lines · changes go live immediately">
        <Link className="btn btn-g btn-sm" href="/admin/categories">Categories</Link>
        {permissions.includes("editContent") && <Link className="btn btn-g btn-sm" href="/admin/content">Edit Kinyarwanda text</Link>}
      </PageHead>
      <div className="content"><ServiceAdmin services={services} categories={categories} demand={demand} canTranslate={canTranslate} rwStatus={rwStatus} initialCategory={sp.category ?? "all"} startNew={sp.new === "1"} /></div>
    </>
  );
}
