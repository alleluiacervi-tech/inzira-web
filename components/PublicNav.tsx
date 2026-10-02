"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, Logo } from "./ui";
import { useDialog } from "./useDialog";

const LINKS = [
  { href: "/services", label: "Services" },
  { href: "/#how", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#business", label: "For businesses" },
  { href: "/#faq", label: "Help" },
];
// Only languages the site is actually translated into. The switch appears once there are two or more:
// add { code: "RW", name: "Kinyarwanda" } and { code: "FR", name: "Français" } when their copy exists.
const LANGS: { code: string; name: string }[] = [{ code: "EN", name: "English" }];

export default function PublicNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const busy = path.startsWith("/start") || path.startsWith("/sign-in") || path.startsWith("/track");
  const [lang, setLang] = useState("EN");
  useEffect(() => setOpen(false), [path]);
  const dialog = useDialog<HTMLDivElement>(open, () => setOpen(false));

  return (
    <>
      <header className="pubnav wrap">
        <div className="row" style={{ gap: 48 }}>
          <Logo />
          <nav aria-label="Main" className="pubnav-links">
            {LINKS.map((l) => (
              <Link key={l.href} className="pub" href={l.href} aria-current={path.startsWith("/services") && l.href === "/services" ? "page" : undefined}>{l.label}</Link>
            ))}
          </nav>
        </div>
        <div className="row g12 nav-desk">
          {LANGS.length > 1 && (
            <div className="row" role="group" aria-label="Language" style={{ gap: 2 }}>
              <Icon name="globe" size={18} style={{ marginRight: 6 }} />
              {LANGS.map(({ code }) => (
                <button key={code} type="button" className="btn btn-g btn-sm" style={{ padding: "0 6px", color: lang === code ? "var(--ink)" : "var(--muted)" }} aria-pressed={lang === code} onClick={() => setLang(code)}>{code}</button>
              ))}
            </div>
          )}
          <Link className="btn btn-g" href="/sign-in">Sign in</Link>
          {/* On the start form and sign-in the page's own button is the main action; one yellow per screen. */}
          {!busy && <Link className="btn btn-p" href="/services">Start a request</Link>}
        </div>
        <div className="row g4 nav-mob">
          <Link className="btn btn-g btn-sm" href="/sign-in">Sign in</Link>
          <button className="btn btn-g btn-ico" type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
        </div>
      </header>
      {open && (
        <div ref={dialog} className="mobmenu" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="row between" style={{ height: 60, padding: "0 16px", borderBottom: "1px solid var(--line)" }}>
            <Logo />
            <button className="btn btn-g btn-ico" type="button" aria-label="Close menu" onClick={() => setOpen(false)}><Icon name="x" size={22} /></button>
          </div>
          <nav aria-label="Mobile" className="stack" style={{ padding: "8px 16px" }}>
            {LINKS.map((l) => <Link key={l.href} className="mm" href={l.href} onClick={() => setOpen(false)}>{l.label}<Icon name="right" size={18} /></Link>)}
            <Link className="mm" href="/track" onClick={() => setOpen(false)}>Track a request<Icon name="right" size={18} /></Link>
          </nav>
          <div className="stack g10" style={{ padding: 16, marginTop: "auto", borderTop: "1px solid var(--line-2)" }}>
            <Link className="btn btn-p btn-lg" href="/services">Start a request</Link>
            <Link className="btn btn-s btn-lg" href="/sign-in">Sign in</Link>
            {LANGS.length > 1 && (
              <div className="row g8" role="group" aria-label="Language" style={{ justifyContent: "center", paddingTop: 6 }}>
                {LANGS.map(({ code, name }) => (
                  <button key={code} type="button" className="btn btn-g btn-sm" aria-pressed={lang === code} onClick={() => setLang(code)} style={{ color: lang === code ? "var(--ember-deep)" : "var(--muted)" }}>{name}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
