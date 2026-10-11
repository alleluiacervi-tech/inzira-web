import { PageMissing } from "@/components/PageStates";
import { text } from "@/lib/i18n/messages";
import { getPortalLocale } from "@/lib/repo";

export default async function NotFound() {
  const locale = await getPortalLocale();
  return <PageMissing what="request" href="/portal/requests" back={text(locale, "shell.requests")} title={text(locale, "portal.missingTitle")} hint={text(locale, "portal.missingHint")} />;
}
