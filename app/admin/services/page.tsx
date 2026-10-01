import { NoAccess } from "@/components/PageStates";
import { PageHead } from "@/components/ui";
import ServiceAdmin from "@/components/ServiceAdmin";
import { getMyPermissions, getServiceDemand, listCategories, listServices } from "@/lib/repo";

export const metadata = { title: "Services & prices" };
export default async function Page() {
  if (!(await getMyPermissions()).includes("editServices")) return <><PageHead title="Services & prices" /><NoAccess what="editing services and prices" /></>;
  const [services, categories, demand] = await Promise.all([listServices({ includeHidden: true }), listCategories(), getServiceDemand()]);
  return (
    <>
      <PageHead title="Services & prices" sub="What customers see in the catalogue · prices are always two lines · changes go live immediately" />
      <div className="content"><ServiceAdmin services={services} categories={categories} demand={demand} /></div>
    </>
  );
}
