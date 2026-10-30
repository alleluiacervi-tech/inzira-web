import type { Metadata } from "next";
import PublicNav from "@/components/PublicNav";
import StartForm from "@/components/StartForm";
import { reviewFeeFor } from "@/lib/pricing";
import { getService } from "@/lib/repo";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: text(locale, "start.describe"), description: text(locale, "start.describeLead"), robots: { index: false, follow: false } };
}

export default async function DescribePage() {
  // A described situation is sent as the catch-all service, so it starts with that service's review fee.
  const other = await getService("other-online-service");
  return (
    <>
      <PublicNav />
      <main id="main"><StartForm service={null} describeFee={other ? reviewFeeFor(other) : null} /></main>
    </>
  );
}
