import { eq } from "drizzle-orm";
import { DevicesCard, PasswordCard } from "@/components/console/AccountSecurity";
import SecurityPanel from "@/components/console/SecurityPanel";
import { PageHead } from "@/components/ui";
import { listStaffSessions, requireStaff, staffSecurityRequired } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";

export const metadata = { title: "Sign-in security" };
export default async function Page({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const me = await requireStaff("/console/security");
  const [row] = await (await db()).select({ enabledAt: s.staff.totpEnabledAt, recovery: s.staff.totpRecovery, username: s.staff.username, email: s.staff.email, passwordHash: s.staff.passwordHash })
    .from(s.staff).where(eq(s.staff.id, me.id));
  const required = staffSecurityRequired();
  const setup = (await searchParams).setup === "1";
  const devices = await listStaffSessions(me.id);
  return (
    <>
      <PageHead title="Sign-in security" sub="Your password, the authenticator app, and the devices you’re signed in on" />
      <div className="content stack g16" style={{ maxWidth: 680 }}>
        <PasswordCard username={row?.username ?? row?.email ?? null} hasPassword={!!row?.passwordHash} />
        <SecurityPanel enabled={!!row?.enabledAt} recoveryLeft={row?.recovery?.length ?? 0} required={required} mustSetUp={required && setup && (!row?.enabledAt || !row?.passwordHash)} />
        <DevicesCard devices={devices} />
      </div>
    </>
  );
}
