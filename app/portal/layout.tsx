import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import { initials } from "@/lib/format";
import { getAccount, listMyNotifications } from "@/lib/repo";

export const metadata: Metadata = { title: { default: "My portal", template: "%s · Inzira portal" }, robots: { index: false } };
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [account, notifications] = await Promise.all([getAccount(), listMyNotifications()]);
  const others = account.profiles.filter((p) => p.relation !== "self");
  const who = { initials: initials(account.name), name: account.name, sub: ["Personal", ...others.filter((p) => p.kind !== "person").map((p) => p.name)].join(" · ") };
  return <AppShell kind="customer" who={who} unread={notifications.filter((n) => n.unread).length}>{children}</AppShell>;
}
