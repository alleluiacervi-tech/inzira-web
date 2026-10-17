"use client";
import { useState, type ReactNode } from "react";
import type { Permission, Staff } from "@/lib/types";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { AddClientModal } from "./AddClientModal";
import { Toast } from "./Toast";
import { StaffTabBar } from "./StaffTabBar";
import "./console.css";

export default function StaffShell({
  user,
  permissions = [],
  inboxCount = 0,
  openCasesCount = 0,
  identityCount = 0,
  taxCount = 0,
  unreadNotifications = 0,
  dateRange,
  onDateRangeChange,
  children,
}: {
  user: Staff;
  permissions?: Permission[];
  inboxCount?: number;
  openCasesCount?: number;
  identityCount?: number;
  taxCount?: number;
  unreadNotifications?: number;
  dateRange?: number;
  onDateRangeChange?: (days: number) => void;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  return (
    <div className="console-root">
      <div className="console-layout">
        <Sidebar
          user={user}
          permissions={permissions}
          inboxCount={inboxCount}
          openCasesCount={openCasesCount}
          identityCount={identityCount}
          taxCount={taxCount}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div className="console-main-area">
          <TopBar
            user={user}
            permissions={permissions}
            unreadNotifications={unreadNotifications}
            dateRange={dateRange}
            onDateRangeChange={onDateRangeChange}
            onOpenNewClient={() => setClientModalOpen(true)}
            onOpenRecordPayment={() => setPaymentModalOpen(true)}
            onToggleMobileMenu={() => setMobileOpen(!mobileOpen)}
          />
          <main className="console-content">
            {children}
          </main>
          <StaffTabBar user={user} permissions={permissions} inboxCount={inboxCount} />
        </div>
      </div>

      <RecordPaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        onSuccess={(msg) => setToastMsg(msg)}
      />

      <AddClientModal
        open={clientModalOpen}
        onClose={() => setClientModalOpen(false)}
        onSuccess={(id, name) => setToastMsg(`Client ${name} created.`)}
      />

      {toastMsg && (
        <Toast
          message={toastMsg}
          onDismiss={() => setToastMsg("")}
        />
      )}
    </div>
  );
}
