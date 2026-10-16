// What the live site is connected to, for Admin › System. Reads configuration and a few rows; it never
// returns a secret, only whether one is set. Server only.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, iso, schema as s } from "./db";
import { RETENTION_DAYS } from "./privacy";
import { counts } from "./outbox";
import { isSet, SITE } from "./site";
import { turnstileEnabled } from "./turnstile";

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
  return { key: "db", name, state: "test", detail: "Built-in test database. Data is lost when the server restarts on Vercel.", fix: "Set DATABASE_URL to a persistent Postgres database (Neon, Supabase or Railway). The server applies the schema when it starts." };
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

function email(): Check {
  const name = "Email (customer sign-in and updates)";
  if (has("SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM")) return { key: "email", name, state: "ready", detail: `Sending as ${process.env.EMAIL_FROM} through ${process.env.SMTP_HOST}, at most ${Number(process.env.EMAIL_DAILY_LIMIT) || 400} a day. Run npm run check:email from the server to test it.` };
  if (!production() || demo()) return { key: "email", name, state: "test", detail: "Messages are printed to the server log; codes appear on screen. Nobody receives an email.", fix: "Set SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM." };
  return { key: "email", name, state: "missing", detail: "No mailbox. Customers can’t sign in or get updates by email.", fix: "Set SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM, with SPF, DKIM and DMARC on the domain." };
}

async function messages(): Promise<Check> {
  const name = "Message queue";
  const c = await counts();
  if (c.failed > 0) return { key: "outbox", name, state: "missing", detail: `${c.failed} message${c.failed === 1 ? "" : "s"} could not be delivered after five tries.`, fix: "Check the mailbox or SMS provider above. Customers can still see the update in their portal." };
  if (c.pending > 0) return { key: "outbox", name, state: "test", detail: `${c.pending} message${c.pending === 1 ? " is" : "s are"} waiting to be sent or retried. The scheduled job keeps trying.` };
  return { key: "outbox", name, state: "ready", detail: "Nothing waiting. Failed messages are retried automatically." };
}

async function dataProtection(): Promise<Check[]> {
  const live = production() && !demo();
  const key: Check = process.env.DATA_KEY
    ? { key: "datakey", name: "Encryption of ID and TIN numbers", state: "ready", detail: "Stored encrypted (AES-256-GCM) with a key that is not in the database." }
    : { key: "datakey", name: "Encryption of ID and TIN numbers", state: live ? "missing" : "test", detail: live ? "DATA_KEY is not set. Customers’ ID numbers can’t be stored." : "A fixed development key is used.", fix: "Set DATA_KEY (openssl rand -hex 32) and keep a copy somewhere safe: without it the numbers can’t be read." };
  const secret: Check = process.env.AUTH_SECRET
    ? { key: "secret", name: "Sign-in secret", state: "ready", detail: "Sign-in codes are keyed to this server." }
    : { key: "secret", name: "Sign-in secret", state: live ? "missing" : "test", detail: "AUTH_SECRET is not set; stored codes use a plain hash.", fix: "Set AUTH_SECRET (openssl rand -hex 32)." };
  const ip: Check = process.env.VERCEL || process.env.CLIENT_IP_HEADER
    ? { key: "ip", name: "Caller address for rate limits", state: "ready", detail: process.env.CLIENT_IP_HEADER ? `Read from the ${process.env.CLIENT_IP_HEADER} header.` : "Read from Vercel’s own header." }
    : { key: "ip", name: "Caller address for rate limits", state: live ? "missing" : "test", detail: "No trusted address header, so every caller shares one limit.", fix: "Set CLIENT_IP_HEADER to the header your proxy sets (x-real-ip, cf-connecting-ip)." };
  const people = await (await db()).select({ on: sql<number>`count(*) filter (where ${s.staff.totpEnabledAt} is not null)::int`, all: sql<number>`count(*)::int` }).from(s.staff).where(eq(s.staff.active, true));
  const { on, all } = people[0] ?? { on: 0, all: 0 };
  const mfa: Check = process.env.REQUIRE_STAFF_TOTP === "1"
    ? { key: "mfa", name: "Staff authenticator step", state: "ready", detail: `Required for everyone. ${on} of ${all} active staff have set it up.` }
    : { key: "mfa", name: "Staff authenticator step", state: on === all && all > 0 ? "ready" : "test", detail: `Optional. ${on} of ${all} active staff have set it up.`, fix: "Staff turn it on under Sign-in security. Set REQUIRE_STAFF_TOTP=1 to make it compulsory once everyone has." };
  const bot: Check = turnstileEnabled()
    ? { key: "bot", name: "Bot check on code forms", state: "ready", detail: "Cloudflare Turnstile protects the sign-in and request forms." }
    : { key: "bot", name: "Bot check on code forms", state: "test", detail: "Off. Per-address and per-IP limits still apply, but a botnet could use up the daily email allowance.", fix: "Add a Cloudflare Turnstile widget and set NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY." };
  return [key, secret, ip, mfa, bot];
}

function payments(): Check[] {
  const mode = process.env.PAYMENT_PROVIDER;
  if (mode === "live" || mode === "intouchpay") {
    const ready = has("INTOUCHPAY_USERNAME", "INTOUCHPAY_ACCOUNT_NO", "INTOUCHPAY_PARTNER_PASSWORD");
    const base = process.env.INTOUCHPAY_BASE_URL ?? "https://www.intouchpay.co.rw/api";
    const https = base.startsWith("https://");
    const callback = process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://")
      ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/api/payments/callback`
      : "";
    const auth = has("INTOUCHPAY_CALLBACK_USER", "INTOUCHPAY_CALLBACK_PASSWORD");
    if (!ready) return [{ key: "pay", name: "IntouchPay", state: "missing", detail: "Credentials not set. Customers can’t pay.", fix: "Set INTOUCHPAY_USERNAME, INTOUCHPAY_ACCOUNT_NO and INTOUCHPAY_PARTNER_PASSWORD from the IntouchPay partner account." }];
    const detail = `Collects MTN and Airtel through IntouchPay (${base}).${callback ? ` Callback ${callback}.` : " Set NEXT_PUBLIC_SITE_URL to the https site address so prompts include a callback."}${auth ? " Callback basic auth is required." : " Callback basic auth is not set; payment state still comes from GetTransactionStatus."}`;
    return [{ key: "pay", name: "IntouchPay", state: https ? "ready" : "missing", detail, fix: https ? undefined : "INTOUCHPAY_BASE_URL must be https." }];
  }
  if (mode === "direct") {
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
    return [{ key: "pay", name: "Mobile money", state: "test", detail: "Simulator: payments are approved after two seconds and no money moves.", fix: "Set PAYMENT_PROVIDER=live with the IntouchPay username, account number and partner password." }];
  }
  return [{ key: "pay", name: "Mobile money", state: "missing", detail: "No payment provider. Customers can’t pay.", fix: "Set PAYMENT_PROVIDER=live with the IntouchPay username, account number and partner password." }];
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
    { title: "Talking to customers", checks: [email(), sms(), await messages(), ...payments()] },
    { title: "Protecting data", checks: await dataProtection() },
    { title: "Before launch", checks: [...site(), await catalogue()] },
  ];
  return { groups, runs };
}
