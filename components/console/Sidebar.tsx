"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Logo } from "@/components/ui";
import type { Permission, Staff } from "@/lib/types";

type NavItem = {
  label: string;
  href: string;
  icon: string;
  permission?: Permission;
  badge?: number;
  matchPrefix?: string;
};

type NavGroup = {
  group: string;
  items: NavItem[];
};

export function Sidebar({
  user,
  permissions = [],
  inboxCount = 0,
  openCasesCount = 0,
  mobileOpen = false,
  onCloseMobile,
}: {
  user: Staff;
  permissions: Permission[];
  inboxCount?: number;
  openCasesCount?: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const path = usePathname();
  const can = (p?: Permission) => !p || permissions.includes(p) || user.role === "Owner";

  const GROUPS: NavGroup[] = [
    {
      group: "Home",
      items: [
        { label: "Overview", href: "/admin", icon: "chart", matchPrefix: "/admin" },
        { label: "Inbox", href: "/console/inbox", icon: "inbox", permission: "assign", badge: inboxCount },
        { label: "My day", href: "/agent", icon: "sun", badge: openCasesCount },
      ],
    },
    {
      group: "Work",
      items: [
        { label: "Requests", href: "/console/requests", icon: "list", matchPrefix: "/console/requests" },
        { label: "Clients", href: "/console/clients", icon: "users", matchPrefix: "/console/clients" },
        { label: "New intake", href: "/agent/intake", icon: "plus" },
      ],
    },
    {
      group: "Catalogue",
      items: [
        { label: "Services", href: "/admin/services", icon: "grid", permission: "editServices", matchPrefix: "/admin/services" },
      ],
    },
    {
      group: "Money",
      items: [
        { label: "Payments", href: "/admin/payments", icon: "card", permission: "recordOfficial", matchPrefix: "/admin/payments" },
      ],
    },
    {
      group: "Team",
      items: [
        { label: "Roles & people", href: "/admin/roles", icon: "lock", permission: "manageStaff", matchPrefix: "/admin/roles" },
      ],
    },
    {
      group: "System",
      items: [
        { label: "Audit logs", href: "/admin/audit", icon: "log", permission: "viewAudit", matchPrefix: "/admin/audit" },
      ],
    },
  ];

  const isItemActive = (item: NavItem) => {
    if (item.href === "/admin") return path === "/admin" || path === "/console/overview";
    if (item.href === "/agent") return path === "/agent" || path === "/console/my-day";
    if (item.matchPrefix) return path.startsWith(item.matchPrefix);
    return path === item.href;
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="console-sidepanel-backdrop c-mobile-only"
          onClick={onCloseMobile}
          style={{ zIndex: 39 }}
        />
      )}
      <aside className={`console-sidebar ${mobileOpen ? "open" : ""}`}>
        {/* Brand Header */}
        <div className="row between" style={{ padding: "16px 18px", borderBottom: "1px solid var(--c-border)" }}>
          <div className="stack" style={{ gap: 2 }}>
            <Logo href="/admin" />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--c-ember)" }}>
              Staff Console
            </span>
          </div>
          {onCloseMobile && (
            <button
              type="button"
              className="c-btn c-btn-ghost c-btn-sm c-btn-icon c-mobile-only"
              onClick={onCloseMobile}
              aria-label="Close navigation"
            >
              <Icon name="x" size={18} />
            </button>
          )}
        </div>

        {/* Nav Groups */}
        <nav className="stack grow" style={{ padding: "8px 0", gap: 6 }}>
          {GROUPS.map((grp) => {
            const visibleItems = grp.items.filter((it) => can(it.permission));
            if (!visibleItems.length) return null;

            return (
              <div key={grp.group} className="stack" style={{ gap: 1 }}>
                <span className="console-nav-group-title">{grp.group}</span>
                {visibleItems.map((it) => {
                  const active = isItemActive(it);
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={`console-nav-item ${active ? "active" : ""}`}
                      onClick={onCloseMobile}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon name={it.icon} size={17} />
                      <span>{it.label}</span>
                      {it.badge !== undefined && it.badge > 0 && (
                        <span className="console-nav-badge">{it.badge}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer Info */}
        <div
          className="row between g10"
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--c-border)",
            background: "#fafafa",
            fontSize: 12,
            color: "var(--c-text-muted)",
          }}
        >
          <span>Kigali, Rwanda</span>
          <span style={{ fontWeight: 600 }}>v1.0 Staff</span>
        </div>
      </aside>
    </>
  );
}
