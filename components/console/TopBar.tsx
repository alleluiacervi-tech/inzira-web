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

export function TopBar({
  user,
  permissions = [],
  unreadNotifications = 0,
  dateRange,
  onDateRangeChange,
  onOpenNewClient,
  onOpenRecordPayment,
  onToggleMobileMenu,
}: {
  user: Staff;
  permissions?: Permission[];
  unreadNotifications?: number;
  dateRange?: number;
  onDateRangeChange?: (days: number) => void;
  onOpenNewClient?: () => void;
  onOpenRecordPayment?: () => void;
  onToggleMobileMenu?: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Global Cmd+K keyboard shortcut
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

  // Close profile dropdown on click outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [profileOpen]);

  return (
    <>
      <header className="console-topbar">
        {/* Left: menu and logo on phones, search everywhere */}
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
            <kbd className="c-kbd">⌘K</kbd>
          </button>
        </div>

        {/* Right: Date Range (if provided), + New, Notifications, Profile */}
        <div className="row g12 c-topbar-right">
          {dateRange !== undefined && onDateRangeChange && (
            <div className="row g4 console-panel" style={{ padding: 2, background: "var(--c-surface-hover)" }}>
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => onDateRangeChange(days)}
                  style={{
                    border: "none",
                    background: dateRange === days ? "var(--c-surface)" : "transparent",
                    color: dateRange === days ? "var(--c-text)" : "var(--c-text-muted)",
                    fontWeight: dateRange === days ? 600 : 500,
                    fontSize: 12,
                    padding: "3px 8px",
                    borderRadius: 4,
                    cursor: "pointer",
                    boxShadow: dateRange === days ? "0 1px 3px rgba(22, 24, 27, 0.08)" : "none",
                  }}
                >
                  {days}d
                </button>
              ))}
            </div>
          )}

          <NewMenu
            onOpenNewClient={onOpenNewClient}
            onOpenRecordPayment={onOpenRecordPayment}
          />

          {/* Profile Menu */}
          <div style={{ position: "relative" }} ref={profileRef}>
            <button
              type="button"
              className="row g8 c-btn c-btn-ghost c-btn-sm"
              style={{ padding: "0 6px" }}
              onClick={() => setProfileOpen(!profileOpen)}
              aria-label="Staff profile menu"
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "var(--c-ember-bg)",
                  color: "var(--c-ember)",
                  fontSize: 11,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
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
                style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  marginTop: 6,
                  width: 220,
                  padding: 12,
                  zIndex: 50,
                  boxShadow: "var(--shadow-pop)",
                }}
              >
                <div className="stack" style={{ gap: 2, paddingBottom: 8, borderBottom: "1px solid var(--c-border)" }}>
                  <strong style={{ fontSize: 13.5 }}>{user.name}</strong>
                  <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>{user.title}</span>
                  <span className="c-badge c-badge-ember" style={{ alignSelf: "flex-start", marginTop: 4 }}>
                    {user.role}
                  </span>
                </div>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="row g8 console-nav-item linkish"
                    style={{ width: "100%", margin: 0, padding: "6px 8px", color: "var(--c-red)" }}
                  >
                    <Icon name="arrow" size={15} />
                    <span>Sign out</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Search Dialog */}
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSearch={searchConsole}
      />
    </>
  );
}
