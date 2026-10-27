// Database tasks.
//   npm run db:migrate   apply migrations in ./drizzle to DATABASE_URL (or the local PGlite database)
//   npm run db:setup     production first run: fill an EMPTY database with the catalogue and one
//                        owner (OWNER_NAME and OWNER_PHONE must be set). No sample data.
//   npm run db:seed      development: fill an EMPTY database with the catalogue and sample data
//   npm run db:owner    live database: set the owner's console login from OWNER_USERNAME and OWNER_PASSWORD, replacing any
//                        password the owner has. `npm run db:owner -- hash` prints OWNER_PASSWORD_HASH for Vercel instead, and
//                        touches no database.
//   npm run db:remove-samples [--yes]
//                        live database: switch off the sample staff and list the sample customers that a
//                        demo build may have added. Shows what it would do until you pass --yes.
//   npm run db:rekey    after replacing DATA_KEY (keep the old one in DATA_KEY_PREVIOUS): re-encrypt every stored ID and TIN
//                        number with the new key. Run it once, then remove DATA_KEY_PREVIOUS.
//   npm run db:reset     local PGlite only: delete .data/pglite so it is rebuilt on next start
import { rmSync } from "node:fs";
import path from "node:path";

const cmd = process.argv[2];

if (cmd === "reset") {
  if (process.env.DATABASE_URL) { console.error("db:reset only deletes the local PGlite database. Unset DATABASE_URL."); process.exit(1); }
  const dir = path.join(process.cwd(), ".data", "pglite");
  rmSync(dir, { recursive: true, force: true });
  console.log(`Deleted ${dir}. It is recreated and seeded the next time the app starts.`);
  process.exit(0);
}

if (cmd === "owner" && process.argv[3] === "hash") {
  const password = process.env.OWNER_PASSWORD;
  if (!password) { console.error("Set OWNER_PASSWORD, e.g. OWNER_PASSWORD='…' npm run db:owner -- hash"); process.exit(1); }
  const { hashPassword } = await import("../lib/password.ts");
  console.log(await hashPassword(password));
  process.exit(0);
}

const { db, schema } = await import("../lib/db/index.ts");
const { seed, setupProduction } = await import("../lib/db/seed.ts");

if (cmd === "migrate") {
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate((await db()) as never, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  } else {
    await db(); // the local database migrates itself when opened
  }
  console.log("Migrations applied.");
} else if (cmd === "setup") {
  const name = process.env.OWNER_NAME, phone = process.env.OWNER_PHONE;
  if (!name || !phone) { console.error("Set OWNER_NAME and OWNER_PHONE (the owner signs in with this number)."); process.exit(1); }
  const d = await db();
  const existing = await d.select({ id: schema.categories.id }).from(schema.categories).limit(1);
  if (existing.length) { console.log("The database already has data; nothing changed."); process.exit(0); }
  await setupProduction(d, { name, phone });
  console.log(`Set up. ${name} can now sign in with ${phone} and invite the team.`);
} else if (cmd === "owner") {
  const username = process.env.OWNER_USERNAME, password = process.env.OWNER_PASSWORD;
  if (!username || !password) { console.error("Set OWNER_USERNAME and OWNER_PASSWORD."); process.exit(1); }
  const { setOwnerLogin, weakPasswordNote } = await import("../lib/db/owner.ts");
  const { hashPassword } = await import("../lib/password.ts");
  const note = weakPasswordNote(password);
  if (note) console.warn(`Note: ${note}`);
  const result = await setOwnerLogin(await db(), { username, passwordHash: await hashPassword(password) }, { replace: true });
  const said = {
    set: `Done. The owner signs in with ${username.trim().toLowerCase()}, then the authenticator code. Other devices were signed out.`,
    "no-owner": "No active owner found. Run db:setup first.",
    "several-owners": "More than one active owner; nothing changed.",
    "username-taken": "Another staff account already uses that username; nothing changed.",
    kept: "",
  }[result];
  console.log(said);
  process.exit(result === "set" ? 0 : 1);
} else if (cmd === "remove-samples") {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { STAFF_PHONES } = await import("../lib/db/seed.ts");
  const { ACCOUNTS } = await import("../lib/mock/people.ts");
  const d = await db();
  const keep = (process.env.OWNER_PHONE ?? "").replace(/\D/g, "").replace(/^250/, "").replace(/^0/, "");
  const samplePhones = Object.values(STAFF_PHONES).filter((p) => p !== keep);
  const people = await d.select({ id: schema.staff.id, name: schema.staff.name, role: schema.staff.role, active: schema.staff.active }).from(schema.staff).where(inArray(schema.staff.phone, samplePhones));
  const accounts = await d.select({ id: schema.accounts.id, name: schema.accounts.name }).from(schema.accounts).where(inArray(schema.accounts.phone, ACCOUNTS.map((a) => a.phone.replace(/\D/g, "").replace(/^250/, "").replace(/^0/, ""))));
  console.log(`Sample staff with published numbers: ${people.length ? people.map((p) => `${p.name} (${p.role}${p.active ? "" : ", already off"})`).join(", ") : "none"}`);
  console.log(`Sample customers: ${accounts.length ? accounts.map((a) => a.name).join(", ") : "none"} (kept: their requests and payments are records)`);
  if (!process.argv.includes("--yes")) { console.log("Nothing changed. Run again with --yes to switch the sample staff off and end their sessions."); process.exit(0); }
  for (const p of people) {
    await d.update(schema.staff).set({ active: false }).where(eq(schema.staff.id, p.id));
    await d.delete(schema.sessions).where(and(eq(schema.sessions.kind, "staff"), eq(schema.sessions.subjectId, p.id)));
  }
  console.log(`Switched off ${people.length} sample staff and ended their sessions.`);
} else if (cmd === "rekey") {
  const { rekeyIdentity } = await import("../lib/db/protect.ts");
  const n = await rekeyIdentity(await db());
  console.log(`Re-encrypted the ID and TIN numbers of ${n} client${n === 1 ? "" : "s"} with the current DATA_KEY.`);
} else if (cmd === "seed") {
  const d = await db();
  const existing = await d.select({ id: schema.categories.id }).from(schema.categories).limit(1);
  if (existing.length) { console.log("The database already has data; nothing seeded."); process.exit(0); }
  await seed(d);
  console.log("Seeded.");
} else {
  console.error("Usage: tsx scripts/db.mts migrate | setup | owner | seed | remove-samples | rekey | reset");
  process.exit(1);
}
process.exit(0);
