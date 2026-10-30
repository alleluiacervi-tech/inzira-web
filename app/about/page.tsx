import type { Metadata } from "next";
import { publicMetadata } from "@/lib/public-metadata";
import { JsonLd } from "@/components/JsonLd";
import { LegalPage } from "@/components/LegalPage";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { withLocale } from "@/lib/seo";
import { SITE, siteOrigin } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return publicMetadata({ title: text(locale, "meta.aboutTitle"), description: text(locale, "meta.aboutDescription"), path: "/about", locale, absolute: true });
}

export default async function AboutPage() {
  const locale = await getLocale();
  const t = (path: string, vars?: Record<string, string | number>) => text(locale, path, vars);
  const who = { phone: SITE.phone, email: SITE.email, city: SITE.city };
  const origin = siteOrigin();
  const url = origin ? origin + withLocale(locale, "/about") : undefined;
  return (
    <>
      {url && (
        <JsonLd data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: t("meta.aboutTitle"),
          description: t("meta.aboutDescription"),
          url,
          isPartOf: { "@id": `${origin}/#website` },
          about: { "@id": `${origin}/#organization` },
        }} />
      )}
      <LegalPage
        title={t("about.h1")}
        lead={t("about.lead")}
        sections={[
          { title: t("about.doesT"), body: t("about.does") },
          { title: t("about.notT"), body: t("about.not") },
          { title: t("about.nameT"), body: t("about.name") },
          { title: t("about.askT"), body: t("about.ask", who) },
        ]}
        more={{ href: withLocale(locale, "/services"), label: t("about.more") }}
      />
    </>
  );
}
