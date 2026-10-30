import type { Metadata } from "next";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import Catalogue from "@/components/Catalogue";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { localizeCategory, localizeServices } from "@/lib/i18n/present";
import { listCategories, listServices } from "@/lib/repo";
import { publicMetadata } from "@/lib/public-metadata";
import { withLocale } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { siteOrigin } from "@/lib/site";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; for?: string; fee?: string; sort?: string }> }): Promise<Metadata> {
  const [locale, sp, categories, services] = await Promise.all([getLocale(), searchParams, listCategories(), listServices()]);
  const t = (path: string, vars?: Record<string, string | number>) => text(locale, path, vars);
  const found = categories.find((c) => c.id === sp.category && !c.href && services.some(service => service.category === c.id));
  const category = found && localizeCategory(found, locale);
  const title = category ? t("meta.inPlace", { name: category.short }) : t("meta.servicesTitle");
  const description = category?.desc || t("meta.servicesDescription");
  const path = category ? `/services?category=${encodeURIComponent(category.id)}` : "/services";
  return publicMetadata({ title, description, path, locale, index: ![sp.q, sp.for, sp.fee, sp.sort].some(value => value?.trim()) });
}

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; for?: string; fee?: string; sort?: string }> }) {
  const locale = await getLocale();
  const [sp, services, categories] = await Promise.all([searchParams, listServices(), listCategories()]);
  const origin = siteOrigin();
  const category = categories.find(c => c.id === sp.category && !c.href && services.some(service => service.category === c.id));
  const listed = category ? services.filter(s => s.category === category.id) : services;
  const path = category ? `/services?category=${encodeURIComponent(category.id)}` : "/services";
  // A category with no service on the site yet is not offered as a filter.
  const used = new Set(services.map((x) => x.category));
  return (
    <>
      {origin && ![sp.q, sp.for, sp.fee, sp.sort].some(value => value?.trim()) && <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", "@id": `${origin}${withLocale(locale, path)}#collection`, url: `${origin}${withLocale(locale, path)}`, name: category ? localizeCategory(category, locale).name : text(locale, "meta.servicesTitle"), inLanguage: locale, isPartOf: { "@id": `${origin}/#website` }, about: { "@id": `${origin}/#organization` }, mainEntity: { "@type": "ItemList", numberOfItems: listed.length, itemListElement: localizeServices(listed, locale).map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.name, url: `${origin}${withLocale(locale, `/services/${s.slug}`)}` })) } }} />}
      <PublicNav />
      <main id="main"><Catalogue services={localizeServices(services, locale)} categories={categories.filter((c) => c.href || used.has(c.id)).map((c) => localizeCategory(c, locale))} initialQuery={sp.q ?? ""} initialCategory={sp.category ?? "all"} /></main>
      <Footer />
    </>
  );
}
