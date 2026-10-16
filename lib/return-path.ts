/** A path we will send someone back to after sign-in. Anything else is dropped. */
export function safeReturnPath(path: string | undefined | null): string | null {
  if (!path) return null;
  const area = path.startsWith("/portal") ? 7 : path.startsWith("/console") ? 8 : path.startsWith("/admin") ? 6 : 0;
  if (!area) return null;
  const rest = path.slice(area);
  if (rest !== "" && !rest.startsWith("/") && !rest.startsWith("?")) return null;
  if (path.includes("//") || path.includes("\\") || path.includes("@")) return null;
  if (!/^\/[A-Za-z0-9\-._~/?&=%+]*$/.test(path)) return null;
  return path;
}
