import { NoAccess } from "@/components/PageStates";
import { InboxView } from "@/components/console/InboxView";
import { getMyPermissions, getNow, getStaffUser, listAgents, listInbox } from "@/lib/repo";

export const metadata = { title: "Triage Inbox" };

export default async function InboxPage() {
  const perms = await getMyPermissions();
  if (!perms.includes("assign") || !perms.includes("viewAll")) return <NoAccess what="the triage inbox" />;

  const [me, requests, agents, now] = await Promise.all([getStaffUser("/console/inbox"), listInbox(), listAgents(), getNow()]);

  return <InboxView requests={requests} agents={agents} meId={me.id} now={now} />;
}
