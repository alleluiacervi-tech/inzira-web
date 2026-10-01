import type { Metadata } from "next";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import Catalogue from "@/components/Catalogue";
import { listCategories, listServices } from "@/lib/repo";

export const metadata: Metadata = { title: "Services", description: "Business registration, taxes, EBM, land, RURA and Irembo services in Rwanda — with official fees and our assistance fee shown separately." };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const [sp, services, categories] = await Promise.all([searchParams, listServices(), listCategories()]);
  return (
    <>
      <PublicNav />
      <main><Catalogue services={services} categories={categories} initialQuery={sp.q ?? ""} initialCategory={sp.category ?? "all"} /></main>
      <Footer />
    </>
  );
}
