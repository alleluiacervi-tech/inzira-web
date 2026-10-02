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
        {/* Left: Mobile hamburger & quick search button */}
        <div className="row g10">
          <button
            type="button"
            className="c-btn c-btn-ghost c-btn-sm c-btn-icon d-hide"
            onClick={onToggleMobileMenu}
            aria-label="Open sidebar menu"
          >
            <Icon name="list" size={18} />
          </button>

          <button
            type="button"
            className="row g8 c-btn c-btn-secondary c-btn-sm"
            style={{ width: 220, justifyContent: "space-between", color: "var(--c-text-muted)" }}
            onClick={() => setSearchOpen(true)}
          >
            <span className="row g6">
              <Icon name="search" size={14} />
              <span>Search...</span>
            </span>
            <kbd style={{ fontSize: 10, background: "#e5e7eb", padding: "1px 5px", borderRadius: 3, color: "#374151" }}>
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right: Date Range (if provided), + New, Notifications, Profile */}
        <div className="row g12">
          {dateRange !== undefined && onDateRangeChange && (
            <div className="row g4 console-panel" style={{ padding: 2, background: "#f3f4f6" }}>
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
                    boxShadow: dateRange === days ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
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
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
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
