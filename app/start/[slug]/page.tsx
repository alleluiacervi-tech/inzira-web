import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicNav from "@/components/PublicNav";
import StartForm from "@/components/StartForm";
import { getService, listServices } from "@/lib/repo";

export const metadata: Metadata = { title: "Start a request" };

export default async function StartPage({ params }: { params: Promise<{ slug: string }> }) {
  const s = await getService((await params).slug);
  if (!s || !s.visible) notFound();
  return (
    <>
      <PublicNav />
      <main><StartForm service={s} /></main>
    </>
  );
}
