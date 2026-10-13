import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicNav from "@/components/PublicNav";
import StartForm from "@/components/StartForm";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { localizeService } from "@/lib/i18n/present";
import { getService } from "@/lib/repo";

export async function generateMetadata(): Promise<Metadata> {
  return { title: text(await getLocale(), "nav.start") };
}

export default async function StartPage({ params }: { params: Promise<{ slug: string }> }) {
  const locale = await getLocale();
  const s = await getService((await params).slug);
  if (!s || !s.visible) notFound();
  return (
    <>
      <PublicNav />
      <main id="main"><StartForm service={localizeService(s, locale)} /></main>
    </>
  );
}
