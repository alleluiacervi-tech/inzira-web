import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import { ForceEnglish } from "@/components/I18n";
import { initials } from "@/lib/format";
import { DASHBOARD_LOCALE } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { getAccount, listMyNotifications } from "@/lib/repo";

export const metadata: Metadata = { title: { default: "My portal", template: "%s · Inzira portal" }, robots: { index: false } };
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [account, notifications] = await Promise.all([getAccount(), listMyNotifications()]);
  const others = account.profiles.filter((p) => p.relation !== "self");
  const who = { initials: initials(account.name), name: account.name, sub: [text(DASHBOARD_LOCALE, "shell.personal"), ...others.filter((p) => p.kind !== "person").map((p) => p.name)].join(" · ") };
  return (
    <ForceEnglish>
      <AppShell who={who} unread={notifications.filter((n) => n.unread).length}>{children}</AppShell>
    </ForceEnglish>
  );
}
