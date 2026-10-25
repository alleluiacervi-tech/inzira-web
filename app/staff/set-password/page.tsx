import type { Metadata } from "next";
import { ForceEnglish } from "@/components/I18n";
import PublicNav from "@/components/PublicNav";
import SetPassword from "@/components/SetPassword";

export const metadata: Metadata = { title: "Set your password", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function SetPasswordPage() {
  return (
    <ForceEnglish>
      <PublicNav />
      <main id="main" className="wrap auth-main auth-staff">
        <div className="auth-card"><SetPassword /></div>
      </main>
    </ForceEnglish>
  );
}
