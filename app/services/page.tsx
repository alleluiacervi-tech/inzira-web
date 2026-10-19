import type { Metadata } from "next";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import Catalogue from "@/components/Catalogue";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { localizeCategory, localizeServices } from "@/lib/i18n/present";
import { listCategories, listServices } from "@/lib/repo";
import { languageAlternates } from "@/lib/seo";
import { siteOrigin } from "@/lib/site";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }): Promise<Metadata> {
  const [locale, sp, categories] = await Promise.all([getLocale(), searchParams, listCategories()]);
  const t = (path: string, vars?: Record<string, string | number>) => text(locale, path, vars);
  const category = categories.find((c) => c.id === sp.category);
  const labelKey = category ? `nav.cat.${category.id}` : "";
  const label = category ? t(labelKey) : "";
  const title = category ? t("meta.inPlace", { name: label === labelKey ? category.name : label }) : t("meta.servicesTitle");
  const description = category?.desc || t("meta.servicesDescription");
  const origin = siteOrigin();
  const path = category ? `/services?category=${category.id}` : "/services";
  return {
    title,
    description,
    // A search has no stable page of its own. A category does.
    robots: sp.q?.trim() ? { index: false, follow: true } : { index: true, follow: true },
    ...(origin ? { alternates: languageAlternates(origin, path, locale) } : {}),
  };
}

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const locale = await getLocale();
  const [sp, services, categories] = await Promise.all([searchParams, listServices(), listCategories()]);
  return (
    <>
      <PublicNav />
      <main id="main"><Catalogue services={localizeServices(services, locale)} categories={categories.map((c) => localizeCategory(c, locale))} initialQuery={sp.q ?? ""} initialCategory={sp.category ?? "all"} /></main>
      <Footer />
    </>
  );
}
