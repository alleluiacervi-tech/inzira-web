import AccountSettings from "@/components/AccountSettings";
import { PageHead } from "@/components/ui";
import { requireCustomerId } from "@/lib/auth";
import { text } from "@/lib/i18n/messages";
import { finishedWithDocuments, RETENTION_DAYS } from "@/lib/privacy";
import { getAccount, getPortalLocale } from "@/lib/repo";

export async function generateMetadata() {
  return { title: text(await getPortalLocale(), "meta.accountTitle") };
}
export default async function AccountPage() {
  const locale = await getPortalLocale();
  const id = await requireCustomerId("/portal/account");
  const [account, data] = await Promise.all([getAccount(), finishedWithDocuments(id)]);
  const profiles = account.profiles.map(({ id, name, kind, relation, idMasked, tinMasked }) => ({ id, name, kind, relation, idMasked, tinMasked }))
    .sort((a, b) => Number(b.relation === "self") - Number(a.relation === "self"));
  return (
    <>
      <PageHead title={text(locale, "meta.accountTitle")} sub={text(locale, "portal.accountSub")} />
      <div className="content">
        <AccountSettings
          account={{ name: account.name, phone: account.phone, email: account.email ?? "", whatsapp: account.whatsapp, languages: account.languages, since: account.since }}
          profiles={profiles}
          data={{ files: data.files, requests: data.refs.length, open: data.open, retentionDays: RETENTION_DAYS }}
        />
      </div>
    </>
  );
}
