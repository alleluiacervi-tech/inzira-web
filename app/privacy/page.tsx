import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { RETENTION_DAYS } from "@/lib/privacy";
import { SITE } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: text(locale, "meta.privacyTitle"), description: text(locale, "meta.privacyDescription") };
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const t = (path: string, vars?: Record<string, string | number>) => text(locale, path, vars);
  const who = { legal: SITE.legalName, city: SITE.city, email: SITE.email, phone: SITE.phone };
  const days = { days: RETENTION_DAYS };
  return (
    <LegalPage
      title={t("legal.privacyTitle")}
      lead={t("legal.privacyLead")}
      sections={[
        { title: t("legal.whoT"), body: t("legal.who", who) },
        { title: t("legal.collectT"), body: t("legal.collect") },
        { title: t("legal.notT"), body: t("legal.not") },
        { title: t("legal.keepT"), body: t("legal.keep", days) },
        { title: t("legal.seeT"), body: t("legal.see") },
        { title: t("legal.deleteT"), body: t("legal.delete", days) },
        { title: t("legal.askT"), body: t("legal.ask", { email: SITE.email, phone: SITE.phone }) },
      ]}
      more={{ href: "/terms", label: t("legal.seeTerms") }}
    />
  );
}
