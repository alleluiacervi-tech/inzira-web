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

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, session, locale] = await Promise.all([searchParams, getSession(), getLocale()]);
  const back = safeReturnPath(next);
  if (session) {
    if (session.kind === "staff") redirect(back && (back.startsWith("/console") || back.startsWith("/admin")) && back !== "/console" && back !== "/admin" ? back : "/console");
    redirect(back?.startsWith("/portal") ? back : "/portal");
  }
  return (
    <>
      <PublicNav />
      <main id="main" className="wrap auth-main auth-split">
        <div className="auth-card">
          <span className="auth-mark" aria-hidden="true"><img src="/illustrations/document-ready.svg" alt="" width={466} height={757} decoding="async" /></span>
          <SignIn next={back ?? undefined} demo={{ email: showsEmailCodeOnScreen(), phone: showsCodeOnScreen() }} />
        </div>
        <aside className="auth-art" aria-hidden="true">
          <span className="auth-art-frame"><img src="/illustrations/document-ready.svg" alt="" width={466} height={757} decoding="async" /></span>
          <p>{text(locale, "signIn.aside")}</p>
        </aside>
      </main>
    </>
  );
}
