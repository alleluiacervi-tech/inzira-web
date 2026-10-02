import AccountSettings from "@/components/AccountSettings";
import { PageHead } from "@/components/ui";
import { requireCustomerId } from "@/lib/auth";
import { finishedWithDocuments, RETENTION_DAYS } from "@/lib/privacy";
import { getAccount } from "@/lib/repo";

export const metadata = { title: "Account" };
export default async function AccountPage() {
  const id = await requireCustomerId("/portal/account");
  const [account, data] = await Promise.all([getAccount(), finishedWithDocuments(id)]);
  const profiles = account.profiles.map(({ id, name, kind, relation, idMasked, tinMasked }) => ({ id, name, kind, relation, idMasked, tinMasked }))
    .sort((a, b) => Number(b.relation === "self") - Number(a.relation === "self"));
  return (
    <>
      <PageHead title="Account" sub="Your details, signing in, and what we keep" />
      <div className="content">
        <AccountSettings
          account={{ name: account.name, phone: account.phone, whatsapp: account.whatsapp, languages: account.languages, since: account.since }}
          profiles={profiles}
          data={{ files: data.files, requests: data.refs.length, open: data.open, retentionDays: RETENTION_DAYS }}
        />
      </div>
    </>
  );
}
