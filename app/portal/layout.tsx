import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import { LocaleProvider } from "@/components/I18n";
import { initials } from "@/lib/format";
import { text } from "@/lib/i18n/messages";
import { getAccount, getPortalLocale, listMyNotifications } from "@/lib/repo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getPortalLocale();
  return { title: { default: text(locale, "meta.portalTitle"), template: text(locale, "meta.portalTemplate") }, robots: { index: false } };
}
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [account, notifications, locale] = await Promise.all([getAccount(), listMyNotifications(), getPortalLocale()]);
  const others = account.profiles.filter((p) => p.relation !== "self");
  const who = { initials: initials(account.name), name: account.name, sub: [text(locale, "shell.personal"), ...others.filter((p) => p.kind !== "person").map((p) => p.name)].join(" · ") };
  return (
    <LocaleProvider locale={locale}>
      <AppShell who={who} unread={notifications.filter((n) => n.unread).length}>{children}</AppShell>
    </LocaleProvider>
  );
}
