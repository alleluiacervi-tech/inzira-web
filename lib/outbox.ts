// Messages to customers and staff (email and SMS) that are not sign-in codes. A message is written to the outbox
// in the same database transaction as the change it announces, so a change that rolls back sends nothing and a
// change that commits is never lost. It is then sent as soon as the response has gone; anything that fails is
// retried by the scheduled job with growing pauses, and given up on after MAX_ATTEMPTS. Server only.
import { and, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { after } from "next/server";
import { db, schema as s, type Db } from "./db";
import { sendEmail, type Mail } from "./email";
import { sendSms } from "./sms";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type Queued =
  | { channel: "email"; to: string; mail: Mail; ref?: string }
  | { channel: "sms"; to: string; message: string; ref?: string };

const MAX_ATTEMPTS = 5;
/** Pause before attempt 2, 3, 4 and 5. */
const BACKOFF_MS = [5 * 60e3, 30 * 60e3, 2 * 3600e3, 12 * 3600e3];
/** While a worker holds a message, nobody else sends it; if the worker dies, it becomes due again after this. */
const LEASE_MS = 10 * 60e3;

/** Runs work after the response has gone. Outside a request (a script) it simply runs. Failures are logged, never thrown. */
export function afterResponse(task: () => Promise<void>) {
  const run = () => task().catch((e) => console.error("[outbox]", e));
  try { after(run); } catch { void run(); }
}

/** Adds a message inside the caller's transaction and returns its id. Pass the ids to `sendSoon` once the work is committed. */
export async function enqueue(tx: Tx | Db, q: Queued): Promise<number> {
  const payload = q.channel === "email" ? { mail: q.mail } : { message: q.message };
  const [row] = await tx.insert(s.outbox).values({ channel: q.channel, recipient: q.to, payload, ref: q.ref ?? null }).returning({ id: s.outbox.id });
  return row.id;
}

/** Sends these messages after the response, so the customer never waits for a mail server. */
export function sendSoon(ids: number[]) {
  if (ids.length) afterResponse(async () => { for (const id of ids) await deliver(id); });
}

/** Tries one message now (the scheduled job uses this). */
export const sendNow = (id: number) => deliver(id);

/** Tries one message. Returns true when it was sent. Safe to call twice at once: only one caller gets the lease. */
async function deliver(id: number): Promise<boolean> {
  const d = await db();
  const now = Date.now();
  const [row] = await d.update(s.outbox)
    .set({ attempts: sql`${s.outbox.attempts} + 1`, nextAttemptAt: new Date(now + LEASE_MS).toISOString() })
    .where(and(eq(s.outbox.id, id), eq(s.outbox.status, "pending"), lte(s.outbox.nextAttemptAt, new Date(now).toISOString()))).returning();
  if (!row) return false;
  try {
    if (row.channel === "email") await sendEmail({ ...(row.payload as { mail: Mail }).mail, to: row.recipient });
    else await sendSms(row.recipient, (row.payload as { message: string }).message);
    // The text is not kept once it has gone.
    await d.update(s.outbox).set({ status: "sent", sentAt: new Date().toISOString(), payload: {}, lastError: null }).where(eq(s.outbox.id, id));
    return true;
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    // Hitting our own daily cap says nothing about this message: try again in an hour without using up an attempt.
    const capped = /daily email limit/i.test(error);
    const attempts = capped ? row.attempts - 1 : row.attempts;
    const giveUp = attempts >= MAX_ATTEMPTS;
    await d.update(s.outbox).set({
      status: giveUp ? "failed" : "pending", attempts, lastError: error,
      nextAttemptAt: new Date(Date.now() + (capped ? 3600e3 : BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)])).toISOString(),
      ...(giveUp ? { payload: {} } : {}),
    }).where(eq(s.outbox.id, id));
    console.error(`[outbox] ${row.channel} to ${row.channel === "email" ? "an address" : "a number"} failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${error}`);
    return false;
  }
}

/** Scheduled: sends what is due (new messages whose first try was cut short, and retries). */
export async function deliverDue(batch = 100) {
  const d = await db();
  const due = await d.select({ id: s.outbox.id }).from(s.outbox)
    .where(and(eq(s.outbox.status, "pending"), lte(s.outbox.nextAttemptAt, new Date().toISOString()))).orderBy(s.outbox.id).limit(batch);
  let sent = 0;
  for (const m of due) if (await deliver(m.id)) sent++;
  const left = await counts();
  return { due: due.length, sent, waiting: left.pending, failed: left.failed };
}

/** Removes sent messages after a week and abandoned ones after a month. */
export async function pruneOutbox() {
  const d = await db();
  const week = new Date(Date.now() - 7 * 864e5).toISOString(), month = new Date(Date.now() - 30 * 864e5).toISOString();
  await d.delete(s.outbox).where(and(eq(s.outbox.status, "sent"), lt(s.outbox.sentAt, week)));
  await d.delete(s.outbox).where(and(eq(s.outbox.status, "failed"), lt(s.outbox.createdAt, month)));
}

/** Removes the queued messages for a person who deleted their account. */
export async function dropOutboxFor(recipients: string[]) {
  const list = recipients.filter(Boolean);
  if (list.length) await (await db()).delete(s.outbox).where(inArray(s.outbox.recipient, list));
}

export async function counts() {
  const rows = await (await db()).select({ status: s.outbox.status, n: sql<number>`count(*)::int` }).from(s.outbox).groupBy(s.outbox.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  return { pending: by.pending ?? 0, failed: by.failed ?? 0, sent: by.sent ?? 0 };
}
