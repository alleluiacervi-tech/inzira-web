"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOut } from "@/app/actions/auth";
import { whatsappUrl } from "@/lib/site";
import { Icon, Logo, LogoMark } from "./ui";
import { useDialog } from "./useDialog";

type Item = { label: string; icon: string; href: string; match?: string };
type Kind = "customer" | "agent" | "admin";
export type Who = { initials: string; name: string; sub: string };

const NAV: Record<Kind, { items: Item[]; label: string }> = {
  customer: {
    label: "Customer portal",
    items: [
      { label: "Overview", icon: "home", href: "/portal" },
      { label: "My requests", icon: "list", href: "/portal/requests", match: "/portal/requests" },
      { label: "Documents", icon: "file", href: "/portal/documents" },
      { label: "Browse services", icon: "search", href: "/services" },
    ],
  },
  agent: {
    label: "Agent workspace",
    items: [
      { label: "Overview", icon: "home", href: "/agent" },
      { label: "Cases", icon: "list", href: "/agent#cases", match: "/agent/cases" },
      { label: "New intake", icon: "plus", href: "/agent/intake" },
      { label: "Service guides", icon: "note", href: "/services" },
    ],
  },
  admin: {
    label: "Admin console",
    items: [
      { label: "Overview", icon: "chart", href: "/admin" },
      { label: "Services & prices", icon: "grid", href: "/admin/services" },
      { label: "Payments", icon: "card", href: "/admin/payments" },
      { label: "Roles & people", icon: "lock", href: "/admin/roles" },
      { label: "Audit logs", icon: "log", href: "/admin/audit" },
    ],
  },
};

function isActive(path: string, it: Item) {
  if (it.match) return path.startsWith(it.match);
  return path === it.href;
}

function Sidebar({ kind, path, who, other }: { kind: Kind; path: string; who: Who; other?: { label: string; href: string } }) {
  const n = NAV[kind];
  const dark = kind !== "customer";
  return (
    <aside className={`side ${dark ? "side-dark" : "side-light"}`}>
      <div className="stack g10" style={{ padding: "0 8px" }}>
        <Logo dark={dark} />
        {dark && <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--on-dark-2)" }}>{n.label}</span>}
      </div>
      {kind === "customer" && <Link className="btn btn-brand btn-block" href="/services"><Icon name="plus" size={18} /> Start a new request</Link>}
      <nav aria-label={n.label} className="stack" style={{ gap: 2 }}>
        {n.items.map((it) => (
          <Link key={it.href} className="nav-a" href={it.href} aria-current={isActive(path, it) ? "page" : undefined}><Icon name={it.icon} size={19} /><span>{it.label}</span></Link>
        ))}
      </nav>
      <div className="stack g12" style={{ marginTop: "auto" }}>
        {kind === "customer" && (
          <div className="card stack g8" style={{ padding: 16 }}>
            <strong style={{ fontSize: 14 }}>Need a hand?</strong>
            <span className="hint">Call or WhatsApp your agent. We reply within 2 working hours.</span>
            <Link className="lnk" href={whatsappUrl()} style={{ fontSize: 14 }}>Contact support →</Link>
          </div>
        )}
        <div className="row g10" style={{ padding: "12px 8px", borderTop: dark ? "1px solid var(--on-dark-line)" : undefined }}>
          <span className="av" style={dark ? { background: "var(--ember-light)", color: "var(--ink)" } : undefined}>{who.initials}</span>
          <div className="stack" style={{ gap: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: dark ? "var(--on-dark)" : undefined }}>{who.name}</span>
            <span style={{ fontSize: 12.5, color: dark ? "var(--on-dark-muted)" : "var(--muted)" }}>{who.sub}</span>
          </div>
        </div>
        <div className="row g6 wrapx" style={{ padding: "0 8px", fontSize: 12.5 }}>
          {other && <a href={other.href} style={{ color: dark ? "var(--ember-light)" : "var(--ember-deep)", fontWeight: 600 }}>{other.label}</a>}
          <form action={signOut} style={{ marginLeft: "auto" }}><button type="submit" className="linkish" style={{ color: dark ? "var(--on-dark-muted)" : "var(--muted)", fontWeight: 500 }}>Sign out</button></form>
        </div>
      </div>
    </aside>
  );
}

/** `other` links a member of staff to the other area they can use (agent workspace ↔ admin console). */
export default function AppShell({ kind, who, unread = 0, other, children }: { kind: Kind; who: Who; unread?: number; other?: { label: string; href: string }; children: ReactNode }) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [path]);
  const dialog = useDialog<HTMLDivElement>(drawer, () => setDrawer(false));
  const dark = kind !== "customer";
  return (
    <div className="shell">
      <Sidebar kind={kind} path={path} who={who} other={other} />
      <div className="main">
        <header className={`mobtop ${dark ? "dark-top" : ""}`}>
          {dark ? (
            <Link href={`/${kind}`} className="row g10" style={{ textDecoration: "none", color: "var(--on-dark)" }}><LogoMark dark /><span className="d" style={{ fontSize: 18 }}>{NAV[kind].label}</span></Link>
          ) : <Logo />}
          <div className="row g4">
            {kind === "customer" && (
              <Link className="btn btn-g btn-ico" href="/portal#notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} style={{ position: "relative" }}>
                <Icon name="bell" size={22} />{unread > 0 && <span style={{ position: "absolute", top: 10, right: 11, width: 8, height: 8, borderRadius: "50%", background: "var(--ember)" }} />}
              </Link>
            )}
            <button className="btn btn-g btn-ico" type="button" aria-label="Open navigation" aria-expanded={drawer} onClick={() => setDrawer(true)} style={dark ? { color: "var(--on-dark)" } : undefined}><Icon name="menu" size={22} /></button>
          </div>
        </header>
        {children}
      </div>
      {drawer && (
        <div ref={dialog} className="drawer" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="drawer-bg" onClick={() => setDrawer(false)} />
          <Sidebar kind={kind} path={path} who={who} other={other} />
          <button className="btn btn-s btn-ico drawer-x" type="button" aria-label="Close navigation" onClick={() => setDrawer(false)}><Icon name="x" size={20} /></button>
        </div>
      )}
      {kind === "customer" && (
        <nav className="tabbar" aria-label="App">
          <Link href="/portal" aria-current={path === "/portal" ? "page" : undefined}><Icon name="home" size={22} />Home</Link>
          <Link href="/portal/requests" aria-current={path.startsWith("/portal/requests") ? "page" : undefined}><Icon name="list" size={22} />Requests</Link>
          <Link href="/services" className="tab-new" aria-label="Start a new request"><span><Icon name="plus" size={22} stroke={2.2} /></span>New</Link>
          <Link href="/portal/documents" aria-current={path === "/portal/documents" ? "page" : undefined}><Icon name="file" size={22} />Documents</Link>
          <Link href="/portal#account"><Icon name="user" size={22} />Account</Link>
        </nav>
      )}
    </div>
  );
}
