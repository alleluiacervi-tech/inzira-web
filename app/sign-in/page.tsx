import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PublicNav from "@/components/PublicNav";
import SignIn from "@/components/SignIn";
import { getSession } from "@/lib/auth";
import { sendsRealEmail } from "@/lib/email";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: text(await getLocale(), "meta.signInTitle") };
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; link?: string }> }) {
  const [{ next, link }, session] = await Promise.all([searchParams, getSession()]);
  // Someone who only has a private link is not signed in to the account: they may sign in to see the rest.
  if (session && !session.scopeRef) redirect(session.kind === "staff" ? "/agent" : "/portal");
  return (
    <>
      <PublicNav />
      <main className="wrap" style={{ paddingTop: 56, paddingBottom: 96 }}>
        <div style={{ maxWidth: 460, margin: "0 auto" }}><SignIn next={next?.startsWith("/") ? next : undefined} demo={!sendsRealEmail()} invalidLink={link === "invalid"} /></div>
      </main>
    </>
  );
}
