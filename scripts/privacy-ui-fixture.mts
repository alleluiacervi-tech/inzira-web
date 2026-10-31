// Prepare ONLY a disposable local demo database for the browser's archived-state check.
if (process.env.DATABASE_URL || process.env.INZIRA_DEMO !== "1" || !process.env.PGLITE_DIR?.startsWith("/tmp/inzira-privacy-") || process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
  throw new Error("This fixture requires an isolated /tmp/inzira-privacy-* demo database and no remote database/blob configuration.");
}
const { db } = await import("../lib/db/index.ts");
const { purgeCompletedCase } = await import("../lib/case-retention.ts");
const { deleteFile } = await import("../lib/storage.ts");
const d = await db();
const result = await purgeCompletedCase(d, "INZ-2026-03390", deleteFile);
if (!["purged", "not-due"].includes(result.status)) throw new Error(`Archive fixture failed: ${result.status}`);
console.log("Disposable privacy archive fixture prepared: INZ-2026-03390");
process.exit(0);
