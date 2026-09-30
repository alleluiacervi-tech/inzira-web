import type { Metadata } from "next";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = { title: { default: "Admin console", template: "%s · Inzira admin" }, robots: { index: false } };
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell kind="admin">{children}</AppShell>;
}
