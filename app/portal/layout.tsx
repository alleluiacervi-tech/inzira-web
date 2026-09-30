import type { Metadata } from "next";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = { title: { default: "My portal", template: "%s · Inzira portal" } };
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <AppShell kind="customer">{children}</AppShell>;
}
