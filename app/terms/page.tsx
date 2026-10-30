import type { Metadata } from "next";
import { publicMetadata } from "@/lib/public-metadata";
import { withLocale } from "@/lib/seo";
import { LegalPage } from "@/components/LegalPage";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { isSet, SITE } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return publicMetadata({ title: text(locale, "meta.termsTitle"), description: text(locale, "meta.termsDescription"), path: "/terms", locale });
}

export default async function TermsPage() {
  const locale = await getLocale();
  const t = (path: string, vars?: Record<string, string | number>) => text(locale, path, vars);
  const company = [
    t("legal.company", { legal: SITE.legalName, city: SITE.city, phone: SITE.phone, email: SITE.email }),
    isSet(SITE.companyCode) ? t("legal.code", { code: SITE.companyCode }) : "",
    isSet(SITE.tin) ? t("legal.tin", { tin: SITE.tin }) : "",
  ].filter(Boolean).join(" ");
  return (
    <LegalPage
      title={t("legal.termsTitle")}
      lead={t("legal.termsLead")}
      sections={[
        { title: t("legal.doT"), body: t("legal.do") },
        { title: t("legal.feesT"), body: t("legal.fees") },
        { title: t("legal.decideT"), body: t("legal.decide") },
        { title: t("legal.stopT"), body: t("legal.stop") },
        { title: t("legal.docsT"), body: t("legal.docs") },
        { title: t("legal.companyT"), body: company },
      ]}
      more={{ href: withLocale(locale, "/privacy"), label: t("legal.seePrivacy") }}
    />
  );
}
