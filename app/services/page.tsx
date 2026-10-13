import type { Metadata } from "next";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import Catalogue from "@/components/Catalogue";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { localizeCategory, localizeServices } from "@/lib/i18n/present";
import { listCategories, listServices } from "@/lib/repo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: text(locale, "meta.servicesTitle"), description: text(locale, "meta.servicesDescription") };
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
