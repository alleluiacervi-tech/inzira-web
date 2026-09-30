"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, Logo } from "./ui";

const LINKS = [
  { href: "/services", label: "Services" },
  { href: "/#how", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#business", label: "For businesses" },
  { href: "/#faq", label: "Help" },
];
const LANGS = ["EN", "RW", "FR"];

export default function PublicNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState("EN");
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

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
          <div className="row" role="group" aria-label="Language" style={{ gap: 2 }}>
            <Icon name="globe" size={18} style={{ marginRight: 6 }} />
            {LANGS.map((l) => (
              <button key={l} type="button" className="btn btn-g btn-sm" style={{ padding: "0 6px", color: lang === l ? "var(--ink)" : "var(--muted)" }} aria-pressed={lang === l} onClick={() => setLang(l)}>{l}</button>
            ))}
          </div>
          <Link className="btn btn-g" href="/portal">Sign in</Link>
          <Link className="btn btn-p" href="/services">Start a Service <Icon name="arrow" size={18} /></Link>
        </div>
        <div className="row g4 nav-mob">
          <Link className="btn btn-g btn-sm" href="/portal">Sign in</Link>
          <button className="btn btn-g btn-ico" type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
        </div>
      </header>
      {open && (
        <div className="mobmenu" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="row between" style={{ height: 60, padding: "0 16px", borderBottom: "1px solid var(--line)" }}>
            <Logo />
            <button className="btn btn-g btn-ico" type="button" aria-label="Close menu" onClick={() => setOpen(false)}><Icon name="x" size={22} /></button>
          </div>
          <nav aria-label="Mobile" className="stack" style={{ padding: "8px 16px" }}>
            {LINKS.map((l) => <Link key={l.href} className="mm" href={l.href} onClick={() => setOpen(false)}>{l.label}<Icon name="right" size={18} /></Link>)}
            <Link className="mm" href="/portal/requests/INZ-2026-04817">Track a request<Icon name="right" size={18} /></Link>
          </nav>
          <div className="stack g10" style={{ padding: 16, marginTop: "auto", borderTop: "1px solid var(--line-2)" }}>
            <Link className="btn btn-p btn-lg" href="/services">Start a Service</Link>
            <Link className="btn btn-s btn-lg" href="/portal">Sign in</Link>
            <div className="row g8" style={{ justifyContent: "center", paddingTop: 6 }}>
              {[["EN", "English"], ["RW", "Kinyarwanda"], ["FR", "Français"]].map(([k, l]) => (
                <button key={k} type="button" className="btn btn-g btn-sm" aria-pressed={lang === k} onClick={() => setLang(k)} style={{ color: lang === k ? "var(--ember-deep)" : "var(--muted)" }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
