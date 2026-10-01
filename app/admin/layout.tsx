import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import { NoAccess } from "@/components/PageStates";
import { initials } from "@/lib/format";
import { getAdmin, getMyPermissions } from "@/lib/repo";

export const metadata: Metadata = { title: { default: "Admin console", template: "%s · Inzira admin" }, robots: { index: false } };
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [me, perms] = await Promise.all([getAdmin(), getMyPermissions()]);
  const allowed = ["editServices", "manageStaff", "refund", "viewAudit"].some((p) => perms.includes(p as never));
  return (
    <AppShell kind="admin" who={{ initials: initials(me.name), name: me.name, sub: me.title }} other={{ label: "Agent workspace", href: "/agent" }}>
      {allowed ? children : <NoAccess what="the admin console" />}
    </AppShell>
  );
}
