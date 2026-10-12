"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ContactList } from "./Contact";
import { LanguageSwitch } from "./LanguageSwitch";
import { Icon, Logo } from "./ui";
import { useI18n } from "./I18n";
import { useDialog } from "./useDialog";

export default function PublicNav() {
  const path = usePathname();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const busy = path.startsWith("/start") || path.startsWith("/sign-in") || path.startsWith("/track");
  useEffect(() => setOpen(false), [path]);
  const dialog = useDialog<HTMLDivElement>(open, () => setOpen(false));
  const links = [
    { href: "/services", label: t("nav.services") },
    { href: "/#prices", label: t("nav.fees") },
    { href: "/#how", label: t("nav.how") },
    { href: "/#talk", label: t("nav.contact") },
    { href: "/track", label: t("nav.track") },
  ];

  return (
    <>
      <header className="pubnav wrap">
        <div className="row" style={{ gap: 48 }}>
          <Logo label={t("shell.logo")} />
          <nav aria-label={t("nav.main")} className="pubnav-links">
            {links.map((l) => (
              <Link key={l.href} className="pub" href={l.href} aria-current={(l.href === "/services" || l.href === "/track") && path.startsWith(l.href) ? "page" : undefined}>{l.label}</Link>
            ))}
          </nav>
        </div>
        <div className="row g12 nav-desk">
          <div className="row" style={{ gap: 2 }}>
            <Icon name="globe" size={18} style={{ marginRight: 6 }} />
            <LanguageSwitch />
          </div>
          <Link className="btn btn-g" href="/sign-in">{t("nav.signIn")}</Link>
          {!busy && <Link className="btn btn-p" href="/services">{t("nav.start")}</Link>}
        </div>
        <div className="row g4 nav-mob">
          <LanguageSwitch />
          <Link className="btn btn-g btn-sm" href="/sign-in">{t("nav.signIn")}</Link>
          <button className="btn btn-g btn-ico" type="button" aria-label={t("nav.openMenu")} aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
        </div>
      </header>
      {open && (
        <div ref={dialog} className="mobmenu" role="dialog" aria-modal="true" aria-label={t("nav.menu")}>
          <div className="row between" style={{ height: 60, padding: "0 16px", borderBottom: "1px solid var(--line)" }}>
            <Logo label={t("shell.logo")} />
            <button className="btn btn-g btn-ico" type="button" aria-label={t("nav.closeMenu")} onClick={() => setOpen(false)}><Icon name="x" size={22} /></button>
          </div>
          <nav aria-label={t("nav.mobile")} className="stack" style={{ padding: "8px 16px" }}>
            {links.map((l) => <Link key={l.href} className="mm" href={l.href} onClick={() => setOpen(false)}>{l.label}<Icon name="right" size={18} /></Link>)}
          </nav>
          <div className="stack g10" style={{ padding: "8px 16px 0" }}>
            <span className="hint" style={{ fontSize: 14 }}>{t("nav.talk")}</span>
            <ContactList />
          </div>
          <div className="stack g10" style={{ padding: 16, marginTop: "auto", borderTop: "1px solid var(--line-2)" }}>
            <Link className="btn btn-p btn-lg" href="/services">{t("nav.start")}</Link>
            <Link className="btn btn-s btn-lg" href="/sign-in">{t("nav.signIn")}</Link>
            <LanguageSwitch names />
          </div>
        </div>
      )}
    </>
  );
}
