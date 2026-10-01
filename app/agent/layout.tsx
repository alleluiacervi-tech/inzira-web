import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import { initials } from "@/lib/format";
import { getAgent, getMyPermissions } from "@/lib/repo";

export const metadata: Metadata = { title: { default: "Agent workspace", template: "%s · Inzira agent" }, robots: { index: false } };
export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const [me, perms] = await Promise.all([getAgent(), getMyPermissions()]);
  const admin = ["editServices", "manageStaff", "refund", "viewAudit"].some((p) => perms.includes(p as never));
  return <AppShell kind="agent" who={{ initials: initials(me.name), name: me.name, sub: me.title }} other={admin ? { label: "Admin console", href: "/admin" } : undefined}>{children}</AppShell>;
}
