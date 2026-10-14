// Reading Postgres error codes out of the errors drizzle and node-postgres throw.

/** Postgres error code from a drizzle-wrapped failure, if it has one. */
export function pgCode(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 6 && cur && typeof cur === "object"; i++) {
    const c = cur as { code?: unknown; cause?: unknown };
    if (typeof c.code === "string" && /^[0-9A-Z]{5}$/.test(c.code)) return c.code;
    cur = c.cause;
  }
  return undefined;
}

/** True when an insert or update broke a unique index (23505). */
export const isUniqueViolation = (err: unknown) => pgCode(err) === "23505";
