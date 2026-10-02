"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import type { Permission, Staff } from "@/lib/types";

/** Thumb-reach navigation for staff on phones; the sidebar stays available behind the menu button. */
export function StaffTabBar({ user, permissions, inboxCount = 0 }: { user: Staff; permissions: Permission[]; inboxCount?: number }) {
  const path = usePathname();
  const canAssign = user.role === "Owner" || permissions.includes("assign");
  const tabs = [
    { href: "/agent", label: "My day", icon: "sun", on: path === "/agent" || path === "/console/my-day" },
    { href: "/console/requests", label: "Requests", icon: "list", on: path.startsWith("/console/requests") },
    { href: "/agent/intake", label: "New", icon: "plus", on: path === "/agent/intake", accent: true },
    canAssign
      ? { href: "/console/inbox", label: "Inbox", icon: "inbox", on: path === "/console/inbox", badge: inboxCount }
      : { href: "/console/clients", label: "Clients", icon: "users", on: path.startsWith("/console/clients") },
    { href: "/console/clients", label: "Clients", icon: "users", on: path.startsWith("/console/clients") },
  ].filter((t, i, all) => all.findIndex((x) => x.href === t.href) === i);

  return (
    <nav className="c-tabbar c-mobile-only" aria-label="Staff">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={`c-tabbar-item ${t.accent ? "is-accent" : ""}`} aria-current={t.on ? "page" : undefined}
          aria-label={t.accent ? "New intake" : undefined}>
          <span className="c-tabbar-ico">
            <Icon name={t.icon} size={t.accent ? 22 : 21} stroke={t.accent ? 2.2 : 1.8} />
            {"badge" in t && !!t.badge && <span className="c-tabbar-badge">{t.badge > 9 ? "9+" : t.badge}</span>}
          </span>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
