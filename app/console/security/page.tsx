import { eq } from "drizzle-orm";
import { DevicesCard, PasswordCard } from "@/components/console/AccountSecurity";
import SecurityPanel from "@/components/console/SecurityPanel";
import { Alert, PageHead } from "@/components/ui";
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
  const hasPassword = !!row?.passwordHash, hasApp = !!row?.enabledAt;
  const mustSetUp = required && setup && (!hasApp || !hasPassword);
  // While the console is locked for setup, the step still missing comes first.
  const appFirst = mustSetUp && hasPassword && !hasApp;
  const password = <PasswordCard username={row?.username ?? row?.email ?? null} hasPassword={hasPassword} />;
  const app = <SecurityPanel enabled={hasApp} recoveryLeft={row?.recovery?.length ?? 0} required={required} mustSetUp={mustSetUp} />;
  return (
    <>
      <PageHead title="Sign-in security" sub="Your password, the authenticator app, and the devices you’re signed in on" />
      <div className="content stack g16" style={{ maxWidth: 680 }}>
        {mustSetUp && (
          <Alert kind="info" title="One more step before the dashboard">
            <span data-setup-left>The console opens once both are done:</span>
            <span className="setup-left">
              <span className={hasPassword ? "done" : ""}>{hasPassword ? "Password set" : "Set a password"}</span>
              <span className={hasApp ? "done" : ""}>{hasApp ? "Authenticator app on" : "Set up the authenticator app (scan the QR code)"}</span>
            </span>
          </Alert>
        )}
        {appFirst ? <>{app}{password}</> : <>{password}{app}</>}
        <DevicesCard devices={devices} />
      </div>
    </>
  );
}
