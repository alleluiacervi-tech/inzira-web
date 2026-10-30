"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOut } from "@/app/actions/auth";
import { whatsappUrl } from "@/lib/site";
import { useI18n } from "./I18n";
import { LanguageSwitch } from "./LanguageSwitch";
import { Icon, Logo } from "./ui";
import { useDialog } from "./useDialog";

type Item = { label: string; icon: string; href: string; match?: string };
export type Who = { initials: string; name: string; sub: string };

function isActive(path: string, it: Item) {
  if (it.match) return path.startsWith(it.match);
  return path === it.href;
}

function Sidebar({ path, who }: { path: string; who: Who }) {
  const { t } = useI18n();
  const n = {
    label: t("shell.portal"),
    items: [
      { label: t("shell.overview"), icon: "home", href: "/portal" },
      { label: t("shell.requests"), icon: "list", href: "/portal/requests", match: "/portal/requests" },
      { label: t("shell.documents"), icon: "file", href: "/portal/documents" },
      { label: t("shell.account"), icon: "user", href: "/portal/account" },
      { label: t("shell.browse"), icon: "search", href: "/services" },
    ],
  };
  return (
    <aside className="side side-light">
      <div className="stack g10" style={{ padding: "0 8px" }}>
        <Logo label={t("shell.logo")} />
      </div>
      <Link className="btn btn-brand btn-block" href="/services"><Icon name="plus" size={18} /> {t("shell.start")}</Link>
      <nav aria-label={n.label} className="stack" style={{ gap: 2 }}>
        {n.items.map((it) => (
          <Link key={it.href} className="nav-a" href={it.href} aria-current={isActive(path, it) ? "page" : undefined}><Icon name={it.icon} size={19} /><span>{it.label}</span></Link>
        ))}
      </nav>
      <div className="stack g12" style={{ marginTop: "auto" }}>
        <div className="card stack g8" style={{ padding: 16 }}>
          <strong style={{ fontSize: 14 }}>{t("shell.help")}</strong>
          <span className="hint">{t("shell.helpBody")}</span>
          <Link className="lnk row g6" href={whatsappUrl()} style={{ fontSize: 14 }}><Icon name="whatsapp" size={16} />{t("shell.support")}</Link>
        </div>
        <div className="row g10" style={{ padding: "12px 8px" }}>
          <span className="av">{who.initials}</span>
          <div className="stack" style={{ gap: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{who.name}</span>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{who.sub}</span>
          </div>
        </div>
        <div className="row g6 wrapx" style={{ padding: "0 8px", fontSize: 12.5, alignItems: "center" }}>
          {/* Changes the portal and every SMS we send them. */}
          <LanguageSwitch />
          <form action={signOut} style={{ marginLeft: "auto" }}><button type="submit" className="linkish" style={{ color: "var(--muted)", fontWeight: 500 }}>{t("shell.signOut")}</button></form>
        </div>
      </div>
    </aside>
  );
}

/** The customer portal's frame: sidebar on wide screens, a top bar, drawer and tab bar on phones. */
export default function AppShell({ who, unread = 0, children }: { who: Who; unread?: number; children: ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [path]);
  const dialog = useDialog<HTMLDivElement>(drawer, () => setDrawer(false));
  return (
    <div className="shell">
      <a className="skip" href="#main">{t("nav.skip")}</a>
      <Sidebar path={path} who={who} />
      <div className="main">
        <header className="mobtop">
          <Logo label={t("shell.logo")} />
          <div className="row g4">
            <Link className="btn btn-g btn-ico" href="/portal#notifications" aria-label={unread ? t("shell.unread", { n: unread }) : t("shell.notifications")} style={{ position: "relative" }}>
              <Icon name="bell" size={22} />{unread > 0 && <span style={{ position: "absolute", top: 10, right: 11, width: 8, height: 8, borderRadius: "50%", background: "var(--ember)" }} />}
            </Link>
            <button className="btn btn-g btn-ico" type="button" aria-label={t("shell.openNav")} aria-expanded={drawer} onClick={() => setDrawer(true)}><Icon name="menu" size={22} /></button>
          </div>
        </header>
        <main id="main" tabIndex={-1}>{children}</main>
      </div>
      {drawer && (
        <div ref={dialog} className="drawer" role="dialog" aria-modal="true" aria-label={t("shell.nav")}>
          <div className="drawer-bg" onClick={() => setDrawer(false)} />
          <Sidebar path={path} who={who} />
          <button className="btn btn-s btn-ico drawer-x" type="button" aria-label={t("shell.closeNav")} onClick={() => setDrawer(false)}><Icon name="x" size={20} /></button>
        </div>
      )}
      <nav className="tabbar" aria-label={t("shell.portal")}>
        <Link href="/portal" aria-current={path === "/portal" ? "page" : undefined}><Icon name="home" size={22} />{t("shell.overview")}</Link>
        <Link href="/portal/requests" aria-current={path.startsWith("/portal/requests") ? "page" : undefined}><Icon name="list" size={22} />{t("shell.requests")}</Link>
        <Link href="/services" className="tab-new" aria-label={t("shell.start")}><span><Icon name="plus" size={22} stroke={2.2} /></span>{t("nav.start")}</Link>
        <Link href="/portal/documents" aria-current={path === "/portal/documents" ? "page" : undefined}><Icon name="file" size={22} />{t("shell.documents")}</Link>
        <Link href="/portal/account" aria-current={path === "/portal/account" ? "page" : undefined}><Icon name="user" size={22} />{t("shell.account")}</Link>
      </nav>
    </div>
  );
}
