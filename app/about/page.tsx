import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { LegalPage } from "@/components/LegalPage";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { withLocale } from "@/lib/seo";
import { isSet, SITE, siteOrigin } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: { absolute: text(locale, "meta.aboutTitle") }, description: text(locale, "meta.aboutDescription") };
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
          isPartOf: { "@type": "WebSite", name: SITE.name, url: origin },
          about: { "@type": "Organization", name: SITE.legalName, url: origin, email: isSet(SITE.email) ? SITE.email : undefined, telephone: isSet(SITE.phone) ? SITE.phone : undefined, areaServed: "Rwanda" },
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
