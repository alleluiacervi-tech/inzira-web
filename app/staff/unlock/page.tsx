import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { ForceEnglish } from "@/components/I18n";
import PublicNav from "@/components/PublicNav";
import { StaffUnlock } from "@/components/StaffSignIn";
import { getSession, getStaffUser, staffLocked } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { safeReturnPath } from "@/lib/return-path";

export const metadata: Metadata = { title: "Unlock the console", robots: { index: false, follow: false } };

export default async function UnlockPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const back = safeReturnPath((await searchParams).next);
  const next = back && (back.startsWith("/console") || back.startsWith("/admin")) ? back : undefined;
  if (await getStaffUser()) redirect(next ?? "/console");
  const session = await getSession();
  if (!session || !(await staffLocked())) redirect(`/staff${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  const [person] = await (await db()).select({ name: s.staff.name }).from(s.staff).where(eq(s.staff.id, session.subjectId));
  return (
    <ForceEnglish>
      <PublicNav />
      <main id="main" className="wrap auth-main auth-staff">
        <div className="auth-card stack g16">
          <StaffUnlock name={person?.name ?? ""} next={next} />
          <form action={signOut}><button type="submit" className="linkish" style={{ width: "100%", textAlign: "center" }}>Not you? Sign out</button></form>
        </div>
      </main>
    </ForceEnglish>
  );
}
