import Link from "next/link";
import CategoryAdmin, { type CategoryService } from "@/components/CategoryAdmin";
import { NoAccess } from "@/components/PageStates";
import { PageHead } from "@/components/ui";
import { primeContent } from "@/lib/content";
import { getMyPermissions, listCategories, listServices } from "@/lib/repo";
import { BUILT_IN_CATEGORIES } from "@/lib/mock/catalogue";

export const metadata = { title: "Categories" };
export default async function Page() {
  const permissions = await getMyPermissions();
  if (!permissions.includes("editServices")) return <><PageHead title="Categories" /><NoAccess what="editing categories" /></>;
  await primeContent(true);
  const [categories, services] = await Promise.all([listCategories({ includeHidden: true }), listServices({ includeHidden: true })]);
  const inside: Record<string, CategoryService[]> = {};
  for (const s of services) (inside[s.category] ??= []).push({ slug: s.slug, name: s.name, visible: s.visible });
  return (
    <>
      <PageHead title="Categories" sub="The groups of services on the home page, in the menu and on the services list · changes go live immediately">
        <Link className="btn btn-g btn-sm" href="/admin/services">Services &amp; prices</Link>
      </PageHead>
      <div className="content"><CategoryAdmin categories={categories} services={inside} builtIn={BUILT_IN_CATEGORIES} canTranslate={permissions.includes("editContent")} /></div>
    </>
  );
}
