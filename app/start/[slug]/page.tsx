import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicNav from "@/components/PublicNav";
import StartForm from "@/components/StartForm";
import { SERVICES, serviceBySlug } from "@/lib/data";

export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }));
}
export const metadata: Metadata = { title: "Start a request" };

export default async function StartPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ describe?: string }> }) {
  const s = serviceBySlug((await params).slug);
  if (!s) notFound();
  const describe = (await searchParams).describe === "1";
  return (
    <>
      <PublicNav />
      <main><StartForm slug={s.slug} describe={describe} /></main>
    </>
  );
}
