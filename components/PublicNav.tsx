"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ContactList } from "./Contact";
import { LanguageSwitch } from "./LanguageSwitch";
import { Icon, Logo } from "./ui";
import { barePath, withLocale } from "@/lib/seo";
import { useI18n } from "./I18n";
import { useNavCategories } from "./NavCategories";
import { useDialog } from "./useDialog";

export default function PublicNav() {
  const path = usePathname();
  const { locale, t } = useI18n();
  const categories = useNavCategories();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const busy = path.startsWith("/start") || path.startsWith("/sign-in") || path.startsWith("/track");
  useEffect(() => { setOpen(false); setMenu(false); }, [path]);
  const dialog = useDialog<HTMLDivElement>(open, () => setOpen(false));

  // The services menu closes on Escape, on a click elsewhere and when focus leaves it.
  useEffect(() => {
    if (!menu) return;
    const away = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(false); menuRef.current?.querySelector<HTMLElement>("button")?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [menu]);

  const links = [
    { href: "/#how", label: t("nav.how") },
    { href: "/#help", label: t("nav.help") },
    { href: "/track", label: t("nav.track") },
  ];
  const bare = barePath(path);
  const onServices = bare === "/services" || bare.startsWith("/services/");

  return (
    <>
      <a className="skip" href="#main">{t("nav.skip")}</a>
      <header className="pubnav wrap">
        <div className="row" style={{ gap: 40 }}>
          <Logo label={t("shell.logo")} href={withLocale(locale, "/")} />
          <nav aria-label={t("nav.main")} className="pubnav-links">
            <div className="svcmenu" ref={menuRef}>
              <button type="button" className="pub pub-btn" aria-expanded={menu} aria-controls="svc-panel" aria-current={onServices ? "page" : undefined} onClick={() => setMenu(!menu)}>
                {t("nav.services")}<Icon name="down" size={16} stroke={2.2} />
              </button>
              {menu && (
                <div id="svc-panel" className="svc-panel" aria-label={t("nav.servicesMenu")}>
                  <p className="svc-panel-t">{t("nav.browse")}</p>
                  <ul className="svc-panel-list">
                    {categories.map((c) => (
                      <li key={c.id}><Link href={withLocale(locale, `/services?category=${c.id}`)} className="svc-panel-a"><span className="svc-panel-ico"><Icon name={c.icon} size={20} /></span>{c.short}</Link></li>
                    ))}
                  </ul>
                  <Link href={withLocale(locale, "/services")} className="svc-panel-all">{t("nav.allServices")}<Icon name="arrow" size={16} /></Link>
                </div>
              )}
            </div>
            {links.map((l) => (
              <Link key={l.href} className="pub" href={withLocale(locale, l.href)} aria-current={l.href === "/track" && (bare === "/track" || bare.startsWith("/track/")) ? "page" : undefined}>{l.label}</Link>
            ))}
          </nav>
        </div>
        <div className="row g12 nav-desk">
          <div className="row" style={{ gap: 2 }}>
            <Icon name="globe" size={18} style={{ marginRight: 6 }} />
            <LanguageSwitch />
          </div>
          <Link className="btn btn-g" href="/sign-in">{t("nav.signIn")}</Link>
          {!busy && <Link className="btn btn-p" href={withLocale(locale, "/services")}>{t("nav.start")}</Link>}
        </div>
        <div className="row g4 nav-mob">
          <Link className="btn btn-g" href="/sign-in">{t("nav.signIn")}</Link>
          <button className="btn btn-g btn-ico" type="button" aria-label={t("nav.openMenu")} aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu" size={24} /></button>
        </div>
      </header>
      {open && (
        <div ref={dialog} className="mobmenu" role="dialog" aria-modal="true" aria-label={t("nav.menu")}>
          <div className="row between mobmenu-top">
            <Logo label={t("shell.logo")} href={withLocale(locale, "/")} />
            <button className="btn btn-g btn-ico" type="button" aria-label={t("nav.closeMenu")} onClick={() => setOpen(false)}><Icon name="x" size={24} /></button>
          </div>
          <div className="mobmenu-body">
            <form className="mobmenu-search" role="search" action="/services" method="get">
              <Icon name="search" size={20} />
              <label htmlFor="mm-q" className="sr-only">{t("home.searchLabel")}</label>
              <input id="mm-q" name="q" type="search" placeholder={t("home.searchLabel")} autoComplete="off" enterKeyHint="search" />
            </form>
            <nav aria-label={t("nav.mobile")} className="stack">
              <Link className="mm" href={withLocale(locale, "/services")} onClick={() => setOpen(false)}>{t("nav.allServices")}<Icon name="right" size={18} /></Link>
              <ul className="mm-cats">
                {categories.map((c) => (
                  <li key={c.id}><Link href={withLocale(locale, `/services?category=${c.id}`)} onClick={() => setOpen(false)}><Icon name={c.icon} size={18} />{c.short}</Link></li>
                ))}
              </ul>
              {links.map((l) => <Link key={l.href} className="mm" href={withLocale(locale, l.href)} onClick={() => setOpen(false)}>{l.label}<Icon name="right" size={18} /></Link>)}
            </nav>
            <div className="stack g12" style={{ paddingTop: 20 }}>
              <span className="hint" style={{ fontSize: "var(--fs-sm)" }}>{t("nav.talk")}</span>
              <ContactList />
            </div>
          </div>
          <div className="mobmenu-foot">
            <Link className="btn btn-p btn-lg" href={withLocale(locale, "/services")} onClick={() => setOpen(false)}>{t("nav.start")}</Link>
            <LanguageSwitch names />
          </div>
        </div>
      )}
    </>
  );
}
