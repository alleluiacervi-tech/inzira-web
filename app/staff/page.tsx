import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ForceEnglish } from "@/components/I18n";
import PublicNav from "@/components/PublicNav";
import StaffSignIn from "@/components/StaffSignIn";
import { getStaffUser, staffLocked } from "@/lib/auth";
import { safeReturnPath } from "@/lib/return-path";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false, follow: false } };

export default async function StaffSignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const back = safeReturnPath((await searchParams).next);
  const next = back && (back.startsWith("/console") || back.startsWith("/admin")) ? back : undefined;
  if (await getStaffUser()) redirect(next ?? "/console");
  if (await staffLocked()) redirect(`/staff/unlock${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return (
    <ForceEnglish>
      <PublicNav />
      <main id="main" className="wrap auth-main auth-staff">
        <div className="auth-card"><StaffSignIn next={next} /></div>
      </main>
    </ForceEnglish>
  );
}
