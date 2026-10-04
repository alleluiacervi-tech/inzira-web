import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PublicNav from "@/components/PublicNav";
import SignIn from "@/components/SignIn";
import { getSession } from "@/lib/auth";
import { sendsRealSms } from "@/lib/sms";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, session] = await Promise.all([searchParams, getSession()]);
  if (session) redirect(session.kind === "staff" ? "/agent" : "/portal");
  return (
    <>
      <PublicNav />
      <main className="wrap" style={{ paddingTop: 56, paddingBottom: 96 }}>
        <div style={{ maxWidth: 460, margin: "0 auto" }}><SignIn next={next?.startsWith("/") ? next : undefined} demo={!sendsRealSms()} /></div>
      </main>
    </>
  );
}
