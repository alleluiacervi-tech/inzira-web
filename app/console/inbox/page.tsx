import { getMyPermissions, getNow, listStaff, loadRequests } from "@/lib/repo";
import { InboxView } from "@/components/console/InboxView";

export const metadata = { title: "Triage Inbox" };

export default async function InboxPage() {
  const [perms, allCases, staff, now] = await Promise.all([
    getMyPermissions(),
    loadRequests(),
    listStaff(),
    getNow(),
  ]);

  const unassigned = allCases.filter((c) => !c.agentId && c.stage === "received");
  const agents = staff.filter((s) => s.active && s.role === "Agent");

  return <InboxView requests={unassigned} agents={agents} now={now} />;
}
