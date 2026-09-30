import type { Metadata } from "next";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import Catalogue from "@/components/Catalogue";

export const metadata: Metadata = { title: "Services", description: "Find the government, tax, business, land or court procedure you need — with official and assistance fees shown separately." };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <PublicNav />
      <main><Catalogue initialQuery={sp.q ?? ""} initialCategory={sp.category ?? "all"} /></main>
      <Footer />
    </>
  );
}
