"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Logo } from "@/components/ui";
import { hasAdminAccess } from "@/lib/permissions";
import type { Permission, Staff } from "@/lib/types";

type NavItem = {
  label: string;
  href: string;
  icon: string;
  permission?: Permission;
  /** For rules a single permission can’t express. */
  show?: boolean;
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
  identityCount = 0,
  taxCount = 0,
  mobileOpen = false,
  onCloseMobile,
}: {
  user: Staff;
  permissions: Permission[];
  inboxCount?: number;
  openCasesCount?: number;
  identityCount?: number;
  taxCount?: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const path = usePathname();
  const can = (p?: Permission) => !p || permissions.includes(p) || user.role === "Owner";
  const admin = hasAdminAccess(user.role, permissions);

  const GROUPS: NavGroup[] = [
    {
      group: "Home",
      items: [
        { label: "Overview", href: "/console/overview", icon: "chart", show: admin },
        { label: "Inbox", href: "/console/inbox", icon: "inbox", show: can("assign") && can("viewAll"), badge: inboxCount },
        { label: "My day", href: "/console/my-day", icon: "sun", badge: openCasesCount },
      ],
    },
    {
      group: "Work",
      items: [
        { label: "Requests", href: "/console/requests", icon: "list", matchPrefix: "/console/requests" },
        { label: "ID review", href: "/console/identity", icon: "shield", permission: "reviewDocs", matchPrefix: "/console/identity", badge: identityCount },
        { label: "Clients", href: "/console/clients", icon: "users", matchPrefix: "/console/clients" },
        { label: "New intake", href: "/console/intake", icon: "plus", permission: "updateStatus" },
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
        { label: "Payments", href: "/admin/payments", icon: "card", show: admin && (can("refund") || can("viewAll")), matchPrefix: "/admin/payments" },
        { label: "Tax diary", href: "/console/taxes", icon: "calendar", matchPrefix: "/console/taxes", badge: taxCount || undefined },
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
        { label: "System", href: "/admin/system", icon: "settings", permission: "manageStaff", matchPrefix: "/admin/system" },
      ],
    },
    {
      group: "Account",
      items: [
        { label: "Sign-in security", href: "/console/security", icon: "lock", matchPrefix: "/console/security" },
      ],
    },
  ];

  const isItemActive = (item: NavItem) => {
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
            <Logo href="/console" />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--c-text-muted)" }}>
              Staff console
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
            const visibleItems = grp.items.filter((it) => can(it.permission) && it.show !== false);
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
            background: "var(--c-bg)",
            fontSize: 12,
            color: "var(--c-text-muted)",
          }}
        >
          <span>Kigali, Rwanda</span>
          <span style={{ fontWeight: 600 }} title="The build this site is running">{process.env.NEXT_PUBLIC_BUILD}</span>
        </div>
      </aside>
    </>
  );
}
