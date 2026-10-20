"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions/auth";
import { searchConsole } from "@/app/actions/console";
import { Icon, LogoMark } from "@/components/ui";
import { initials } from "@/lib/format";
import type { Staff, Permission } from "@/lib/types";
import { GlobalSearch } from "./GlobalSearch";
import { NewMenu } from "./NewMenu";
import { StaffAlerts } from "./StaffAlerts";

export function TopBar({
  user,
  onOpenNewClient,
  onOpenRecordPayment,
  onToggleMobileMenu,
}: {
  user: Staff;
  permissions?: Permission[];
  onOpenNewClient?: () => void;
  onOpenRecordPayment?: () => void;
  onToggleMobileMenu?: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [modKey, setModKey] = useState("Ctrl");

  useEffect(() => {
    setModKey(/Mac|iPhone|iPad/.test(navigator.platform) || navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setProfileOpen(false); };
    if (profileOpen) {
      document.addEventListener("mousedown", onClick);
      window.addEventListener("keydown", onKey);
    }
    return () => { document.removeEventListener("mousedown", onClick); window.removeEventListener("keydown", onKey); };
  }, [profileOpen]);

  return (
    <>
      <header className="console-topbar">
        <div className="row g8 c-topbar-left">
          <button
            type="button"
            className="c-btn c-btn-ghost c-btn-icon c-topbar-menu c-mobile-only"
            onClick={onToggleMobileMenu}
            aria-label="Open sidebar menu"
          >
            <Icon name="menu" size={20} />
          </button>
          <Link href="/console" className="c-topbar-logo c-mobile-only" aria-label="Inzira staff console home">
            <LogoMark />
          </Link>
          <button
            type="button"
            className="c-btn c-btn-secondary c-btn-sm c-search-trigger"
            onClick={() => setSearchOpen(true)}
            aria-label="Search requests, clients and references"
          >
            <Icon name="search" size={15} />
            <span className="c-search-label">Search…</span>
            <kbd className="c-kbd">{modKey}K</kbd>
          </button>
        </div>

        <div className="row g12 c-topbar-right">
          <NewMenu
            onOpenNewClient={onOpenNewClient}
            onOpenRecordPayment={onOpenRecordPayment}
          />
          <StaffAlerts now={new Date().toISOString()} />

          <div style={{ position: "relative" }} ref={profileRef}>
            <button
              type="button"
              className="row g8 c-btn c-btn-ghost c-btn-sm"
              style={{ padding: "0 6px" }}
              onClick={() => setProfileOpen(!profileOpen)}
              aria-expanded={profileOpen}
              aria-label="Staff profile menu"
            >
              <span
                style={{
                  width: 26, height: 26, borderRadius: "50%", background: "var(--c-ember-bg)", color: "var(--c-ember)",
                  fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {initials(user.name)}
              </span>
              <span className="m-hide" style={{ fontSize: 13, fontWeight: 600 }}>{user.name.split(" ")[0]}</span>
              <Icon name="down" size={12} color="var(--c-text-muted)" />
            </button>

            {profileOpen && (
              <div
                className="console-panel stack g8"
                style={{ position: "absolute", right: 0, top: "100%", marginTop: 6, width: 220, padding: 12, zIndex: 50, boxShadow: "var(--shadow-pop)" }}
              >
                <div className="stack" style={{ gap: 2, paddingBottom: 8, borderBottom: "1px solid var(--c-border)" }}>
                  <strong style={{ fontSize: 13.5 }}>{user.name}</strong>
                  <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>{user.title}</span>
                  <span className="c-badge c-badge-ember" style={{ alignSelf: "flex-start", marginTop: 4 }}>{user.role}</span>
                </div>
                <Link href="/console/my-day" className="row g8 console-nav-item" style={{ margin: 0, padding: "6px 8px" }} onClick={() => setProfileOpen(false)}>
                  <Icon name="sun" size={15} /><span>My day</span>
                </Link>
                <Link href="/console/security" className="row g8 console-nav-item" style={{ margin: 0, padding: "6px 8px" }} onClick={() => setProfileOpen(false)}>
                  <Icon name="lock" size={15} /><span>Sign-in security</span>
                </Link>
                <form action={signOut}>
                  <button type="submit" className="row g8 console-nav-item linkish" style={{ width: "100%", margin: 0, padding: "6px 8px", color: "var(--c-red)" }}>
                    <Icon name="arrow" size={15} />
                    <span>Sign out</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </header>

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSearch={searchConsole}
      />
    </>
  );
}
