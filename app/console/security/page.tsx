import { eq } from "drizzle-orm";
import SecurityPanel from "@/components/console/SecurityPanel";
import { PageHead } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";

export const metadata = { title: "Sign-in security" };
export default async function Page({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const me = await requireStaff("/console/security");
  const [row] = await (await db()).select({ enabledAt: s.staff.totpEnabledAt, recovery: s.staff.totpRecovery }).from(s.staff).where(eq(s.staff.id, me.id));
  const required = process.env.REQUIRE_STAFF_TOTP === "1";
  return (
    <>
      <PageHead title="Sign-in security" sub="Your SMS code, plus an authenticator app for a second step" />
      <div className="content">
        <SecurityPanel enabled={!!row?.enabledAt} recoveryLeft={row?.recovery?.length ?? 0} required={required} mustSetUp={required && !row?.enabledAt && (await searchParams).setup === "1"} />
      </div>
    </>
  );
}
