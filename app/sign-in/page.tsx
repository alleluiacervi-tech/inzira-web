import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PublicNav from "@/components/PublicNav";
import SignIn from "@/components/SignIn";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { showsEmailCodeOnScreen } from "@/lib/email";
import { safeReturnPath } from "@/lib/return-path";
import { showsCodeOnScreen } from "@/lib/sms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: text(await getLocale(), "meta.signInTitle") };
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; method?: string }> }) {
  const [{ next, method }, session] = await Promise.all([searchParams, getSession()]);
  const back = safeReturnPath(next);
  if (session) {
    if (session.kind === "staff") redirect(back && (back.startsWith("/console") || back.startsWith("/admin")) && back !== "/console" && back !== "/admin" ? back : "/console");
    redirect(back?.startsWith("/portal") ? back : "/portal");
  }
  return (
    <>
      <PublicNav />
      <main id="main" className="wrap auth-main">
        <div className="auth-card"><SignIn next={back ?? undefined} demo={{ email: showsEmailCodeOnScreen(), phone: showsCodeOnScreen() }} method={method === "phone" || back?.startsWith("/console") || back?.startsWith("/admin") ? "phone" : "email"} /></div>
      </main>
    </>
  );
}
