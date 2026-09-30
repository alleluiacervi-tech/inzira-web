"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, Logo, LogoMark } from "./ui";

type Item = { label: string; icon: string; href: string; match?: string };
type Kind = "customer" | "agent" | "admin";

const NAV: Record<Kind, { items: Item[]; label: string; who: [string, string, string] }> = {
  customer: {
    label: "Customer portal",
    who: ["AU", "Aline Uwase", "Personal · Umucyo Tech Ltd"],
    items: [
      { label: "Overview", icon: "home", href: "/portal" },
      { label: "My requests", icon: "list", href: "/portal/requests/INZ-2026-04817", match: "/portal/requests" },
      { label: "Documents", icon: "file", href: "/portal/documents" },
      { label: "Browse services", icon: "search", href: "/services" },
    ],
  },
  agent: {
    label: "Agent workspace",
    who: ["EN", "Eric Niyonzima", "Senior agent · Tax & EBM"],
    items: [
      { label: "Overview", icon: "home", href: "/agent" },
      { label: "Case workspace", icon: "list", href: "/agent/cases/INZ-2026-04817", match: "/agent/cases" },
      { label: "Service guides", icon: "note", href: "/services" },
    ],
  },
  admin: {
    label: "Admin console",
    who: ["DM", "Diane Mukamana", "Owner · Administrator"],
    items: [
      { label: "Overview", icon: "chart", href: "/admin" },
      { label: "Services & categories", icon: "grid", href: "/admin/services" },
      { label: "Payments", icon: "card", href: "/admin/payments" },
      { label: "Roles & permissions", icon: "lock", href: "/admin/roles" },
      { label: "Audit logs", icon: "log", href: "/admin/audit" },
      { label: "Agent workspace", icon: "users", href: "/agent" },
    ],
  },
};

function isActive(path: string, it: Item) {
  if (it.match) return path.startsWith(it.match);
  return path === it.href;
}

function Sidebar({ kind, path }: { kind: Kind; path: string }) {
  const n = NAV[kind];
  const dark = kind !== "customer";
  return (
    <aside className={`side ${dark ? "side-dark" : "side-light"}`}>
      <div className="stack g10" style={{ padding: "0 8px" }}>
        <Logo dark={dark} />
        {dark && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ember-light)" }}>{n.label}</span>}
      </div>
      {kind === "customer" && <Link className="btn btn-p btn-block" href="/services"><Icon name="plus" size={18} /> Start new service</Link>}
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
            <Link className="lnk" href="/portal/requests/INZ-2026-04802" style={{ fontSize: 14 }}>Message support →</Link>
          </div>
        )}
        <div className="row g10" style={{ padding: "12px 8px", borderTop: dark ? "1px solid #2E3136" : undefined }}>
          <span className="av" style={dark ? { background: "var(--ember-light)", color: "var(--ink)" } : undefined}>{n.who[0]}</span>
          <div className="stack" style={{ gap: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: dark ? "#F6F4EF" : undefined }}>{n.who[1]}</span>
            <span style={{ fontSize: 12.5, color: dark ? "#B5B1A7" : "var(--muted)" }}>{n.who[2]}</span>
          </div>
        </div>
        <div className="row g6 wrapx" style={{ padding: "0 8px", fontSize: 12.5 }}>
          <span style={{ color: dark ? "#B5B1A7" : "var(--muted)" }}>Switch view:</span>
          {(["customer", "agent", "admin"] as Kind[]).filter((k) => k !== kind).map((k) => (
            <Link key={k} href={k === "customer" ? "/portal" : `/${k}`} style={{ color: dark ? "#F08A4B" : "var(--ember-deep)", fontWeight: 600 }}>{k}</Link>
          ))}
        </div>
      </div>
    </aside>
  );
}

export default function AppShell({ kind, children }: { kind: Kind; children: ReactNode }) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [path]);
  const dark = kind !== "customer";
  return (
    <div className="shell">
      <Sidebar kind={kind} path={path} />
      <div className="main">
        <header className={`mobtop ${dark ? "dark-top" : ""}`}>
          {dark ? (
            <Link href={`/${kind}`} className="row g10" style={{ textDecoration: "none", color: "#F6F4EF" }}><LogoMark dark /><span className="d" style={{ fontSize: 18 }}>{NAV[kind].label}</span></Link>
          ) : <Logo />}
          <div className="row g4">
            {kind === "customer" && (
              <Link className="btn btn-g btn-ico" href="/portal#notifications" aria-label="Notifications, 2 unread" style={{ position: "relative" }}>
                <Icon name="bell" size={22} /><span style={{ position: "absolute", top: 10, right: 11, width: 8, height: 8, borderRadius: "50%", background: "var(--ember)" }} />
              </Link>
            )}
            <button className="btn btn-g btn-ico" type="button" aria-label="Open navigation" aria-expanded={drawer} onClick={() => setDrawer(true)} style={dark ? { color: "#F6F4EF" } : undefined}><Icon name="menu" size={22} /></button>
          </div>
        </header>
        {children}
      </div>
      {drawer && (
        <div className="drawer" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="drawer-bg" onClick={() => setDrawer(false)} />
          <Sidebar kind={kind} path={path} />
        </div>
      )}
      {kind === "customer" && (
        <nav className="tabbar" aria-label="App">
          <Link href="/portal" aria-current={path === "/portal" ? "page" : undefined}><Icon name="home" size={22} />Home</Link>
          <Link href="/portal/requests/INZ-2026-04817" aria-current={path.startsWith("/portal/requests") ? "page" : undefined}><Icon name="list" size={22} />Requests</Link>
          <Link href="/services" className="tab-new" aria-label="Start new service"><span><Icon name="plus" size={22} stroke={2.2} /></span>New</Link>
          <Link href="/portal/documents" aria-current={path === "/portal/documents" ? "page" : undefined}><Icon name="file" size={22} />Documents</Link>
          <Link href="/portal#account"><Icon name="user" size={22} />Account</Link>
        </nav>
      )}
    </div>
  );
}
