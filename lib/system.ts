// What the live site is connected to, for Admin › System. Reads configuration and a few rows; it never
// returns a secret, only whether one is set. Server only.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, iso, schema as s } from "./db";
import { RETENTION_DAYS } from "./privacy";
import { isSet, SITE } from "./site";

export type CheckState = "ready" | "test" | "missing";
export type Check = { key: string; name: string; state: CheckState; detail: string; fix?: string };
export type JobRun = { at: string; ok: boolean; ms: number; result: Record<string, unknown> };

const has = (...keys: string[]) => keys.every((k) => !!process.env[k]);
const production = () => process.env.NODE_ENV === "production";
const demo = () => process.env.INZIRA_DEMO === "1";

async function database(): Promise<Check> {
  const name = "Database";
  try {
    await (await db()).execute(sql`select 1`);
  } catch {
    return { key: "db", name, state: "missing", detail: "The database is not answering.", fix: "Check DATABASE_URL and that the database is running." };
  }
  if (process.env.DATABASE_URL) return { key: "db", name, state: "ready", detail: "Postgres is connected and answering." };
  return { key: "db", name, state: "test", detail: "Built-in test database. Data is lost when the server restarts on Vercel.", fix: "Set DATABASE_URL to a persistent Postgres database (Neon, Supabase or Railway) and run npm run db:migrate." };
}

function sms(): Check {
  const name = "SMS (sign-in codes and updates)";
  const p = process.env.SMS_PROVIDER;
  if (p === "africastalking") {
    if (!has("AT_USERNAME", "AT_API_KEY")) return { key: "sms", name, state: "missing", detail: "Africa’s Talking is chosen but its keys are not set.", fix: "Set AT_USERNAME and AT_API_KEY (and AT_SENDER_ID once approved)." };
    if (process.env.AT_USERNAME === "sandbox") return { key: "sms", name, state: "test", detail: "Africa’s Talking sandbox: messages go to the simulator, not to phones.", fix: "Use your live AT_USERNAME and AT_API_KEY." };
    return { key: "sms", name, state: "ready", detail: `Africa’s Talking${process.env.AT_SENDER_ID ? `, sender “${process.env.AT_SENDER_ID}”` : ", default sender"}. Send yourself a test below.` };
  }
  if (p === "console" || (!p && (!production() || demo()))) return { key: "sms", name, state: "test", detail: "Messages are printed to the server log; codes appear on screen. Nobody receives an SMS.", fix: "Set SMS_PROVIDER=africastalking with AT_USERNAME and AT_API_KEY." };
  return { key: "sms", name, state: "missing", detail: "No SMS provider. Nobody can sign in.", fix: "Set SMS_PROVIDER=africastalking with AT_USERNAME and AT_API_KEY." };
}

function payments(): Check[] {
  const mode = process.env.PAYMENT_PROVIDER;
  if (mode === "live") {
    const sandbox = (process.env.MTN_MOMO_ENVIRONMENT ?? "sandbox") === "sandbox";
    const mtn: Check = has("MTN_MOMO_SUBSCRIPTION_KEY", "MTN_MOMO_API_USER", "MTN_MOMO_API_KEY")
      ? { key: "mtn", name: "MTN MoMo", state: sandbox ? "test" : "ready", detail: sandbox ? "MTN sandbox: test money only." : `Live environment “${process.env.MTN_MOMO_ENVIRONMENT}”.`, fix: sandbox ? "Set MTN_MOMO_ENVIRONMENT and MTN_MOMO_BASE_URL to the live values MTN gives you." : undefined }
      : { key: "mtn", name: "MTN MoMo", state: "missing", detail: "Keys not set. MTN customers can’t pay.", fix: "Set MTN_MOMO_SUBSCRIPTION_KEY, MTN_MOMO_API_USER and MTN_MOMO_API_KEY." };
    const uat = (process.env.AIRTEL_BASE_URL ?? "https://openapiuat.airtel.africa").includes("uat");
    const airtel: Check = has("AIRTEL_CLIENT_ID", "AIRTEL_CLIENT_SECRET")
      ? { key: "airtel", name: "Airtel Money", state: uat ? "test" : "ready", detail: uat ? "Airtel test environment: test money only." : "Live environment.", fix: uat ? "Set AIRTEL_BASE_URL=https://openapi.airtel.africa with live keys." : undefined }
      : { key: "airtel", name: "Airtel Money", state: "missing", detail: "Keys not set. Airtel customers can’t pay.", fix: "Set AIRTEL_CLIENT_ID and AIRTEL_CLIENT_SECRET." };
    return [mtn, airtel];
  }
  if (mode === "simulator" || (!mode && (!production() || demo()))) {
    return [{ key: "pay", name: "Mobile money", state: "test", detail: "Simulator: payments are approved after two seconds and no money moves.", fix: "Set PAYMENT_PROVIDER=live with the MTN MoMo and Airtel Money keys, after testing in their sandboxes." }];
  }
  return [{ key: "pay", name: "Mobile money", state: "missing", detail: "No payment provider. Customers can’t pay.", fix: "Set PAYMENT_PROVIDER=live with the MTN MoMo and Airtel Money keys." }];
}

function storage(): Check {
  const name = "Document storage";
  if (has("BLOB_READ_WRITE_TOKEN") || has("BLOB_STORE_ID", "VERCEL_OIDC_TOKEN")) return { key: "files", name, state: "ready", detail: `Private Vercel Blob. Customer documents are deleted ${RETENTION_DAYS} days after a request finishes.` };
  if (production() && !demo()) return { key: "files", name, state: "missing", detail: "No private storage. Uploads fail.", fix: "Connect a private Vercel Blob store to the project." };
  return { key: "files", name, state: "test", detail: "Files are kept on this server’s disk. On Vercel they disappear when the server restarts.", fix: "Connect a private Vercel Blob store to the project." };
}

function site(): Check[] {
  const placeholders = (["address", "phone", "companyCode", "tin"] as const).filter((k) => !isSet(SITE[k]));
  const out: Check[] = [
    process.env.NEXT_PUBLIC_SITE_URL
      ? { key: "url", name: "Website address", state: "ready", detail: process.env.NEXT_PUBLIC_SITE_URL }
      : { key: "url", name: "Website address", state: "missing", detail: "Not set. SMS links and the sitemap can’t point to the site.", fix: "Set NEXT_PUBLIC_SITE_URL, e.g. https://inzira.rw." },
    placeholders.length
      ? { key: "company", name: "Company details", state: "missing", detail: `Still placeholders: ${placeholders.map((k) => ({ address: "office address", phone: "phone", companyCode: "company code", tin: "TIN" })[k]).join(", ")}${SITE.whatsapp ? "" : ", WhatsApp number"}.`, fix: "Fill them in lib/site.ts. Customers check these before trusting you." }
      : { key: "company", name: "Company details", state: SITE.whatsapp ? "ready" : "missing", detail: SITE.whatsapp ? "Filled in." : "WhatsApp number not set.", fix: SITE.whatsapp ? undefined : "Set whatsapp in lib/site.ts." },
  ];
  if (production() && demo()) out.unshift({ key: "demo", name: "Demo mode", state: "missing", detail: "INZIRA_DEMO=1 is on: codes show on screen and test payments are allowed.", fix: "Remove INZIRA_DEMO from the live site’s environment." });
  return out;
}

async function catalogue(): Promise<Check> {
  const d = await db();
  const [row] = await d.select({ n: sql<number>`count(*)::int` }).from(s.services)
    .where(and(eq(s.services.visible, true), isNull(s.services.officialVerifiedAt), isNull(s.services.officialMode)));
  const n = Number(row?.n ?? 0);
  return n
    ? { key: "fees", name: "Official fees", state: "missing", detail: `${n} service${n === 1 ? " has an official fee" : "s have official fees"} not yet checked with the institution.`, fix: "Check each in Services and mark it as checked." }
    : { key: "fees", name: "Official fees", state: "ready", detail: "Every official fee shown to customers has been checked." };
}

export async function lastRuns(limit = 5): Promise<JobRun[]> {
  const rows = await (await db()).select().from(s.jobRuns).orderBy(desc(s.jobRuns.id)).limit(limit);
  return rows.map((r) => ({ at: iso(r.at)!, ok: r.ok, ms: r.ms, result: r.result }));
}

function job(runs: JobRun[]): Check {
  const name = "Scheduled job";
  if (!process.env.CRON_SECRET) return { key: "cron", name, state: production() && !demo() ? "missing" : "test", detail: "CRON_SECRET is not set, so the daily job refuses to run.", fix: "Set CRON_SECRET in the Vercel project; Vercel sends it to the job automatically." };
  const last = runs[0];
  if (!last) return { key: "cron", name, state: "missing", detail: "Has not run yet.", fix: "It runs daily at 08:00 Kigali time. Use “Run now” below to check it works." };
  const hours = (Date.now() - Date.parse(last.at)) / 3600e3;
  if (!last.ok) return { key: "cron", name, state: "missing", detail: `Last run failed: ${String(last.result.error ?? "unknown error")}.` };
  if (hours > 26) return { key: "cron", name, state: "missing", detail: `Last ran ${Math.round(hours)} hours ago. It should run daily.`, fix: "Check the cron job in the Vercel project settings." };
  return { key: "cron", name, state: "ready", detail: "Ran in the last day without errors." };
}

export async function systemStatus() {
  const runs = await lastRuns();
  const groups: { title: string; checks: Check[] }[] = [
    { title: "Running the site", checks: [await database(), storage(), job(runs)] },
    { title: "Talking to customers", checks: [sms(), ...payments()] },
    { title: "Before launch", checks: [...site(), await catalogue()] },
  ];
  return { groups, runs };
}
