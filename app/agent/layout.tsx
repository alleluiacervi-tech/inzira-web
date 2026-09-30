import type { Metadata } from "next";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = { title: { default: "Agent workspace", template: "%s · Inzira agent" }, robots: { index: false } };
export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return <AppShell kind="agent">{children}</AppShell>;
}
