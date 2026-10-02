// The database (files table) records who may read each uploaded file. Vercel Blob is private;
// access is still checked by the authenticated file route before bytes are returned.
// Without Blob credentials files go to local disk — allowed in development and in demo builds
// (INZIRA_DEMO=1), refused in production.
import { mkdir, readFile as read, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";

// On Vercel only /tmp is writable, so demo uploads there last as long as the instance does.
const root = process.env.UPLOAD_DIR ?? (process.env.VERCEL ? "/tmp/inzira-uploads" : path.join(process.cwd(), ".data", "uploads"));
const keyPath = (key: string) => key.split("/").map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "_")).filter((part) => part && part !== "." && part !== "..").join("/");
const safe = (key: string) => path.join(root, keyPath(key));
const hasBlobCredentials = () => !!process.env.BLOB_READ_WRITE_TOKEN || (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN);
const useBlob = () => {
  if (hasBlobCredentials()) return true;
  if (process.env.NODE_ENV === "production" && process.env.INZIRA_DEMO !== "1") {
    throw new Error("Private file storage is not configured. Connect a private Vercel Blob store or set BLOB_READ_WRITE_TOKEN.");
  }
  return false;
};

export const MAX_BYTES = 10 * 1024 * 1024;
export const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

export async function putFile(key: string, bytes: Uint8Array, contentType = "application/octet-stream") {
  const pathname = keyPath(key);
  if (!pathname) throw new Error("A storage key is required.");
  if (useBlob()) {
    await put(pathname, Buffer.from(bytes), { access: "private", addRandomSuffix: false, contentType });
    return;
  }
  await mkdir(path.dirname(safe(pathname)), { recursive: true });
  await writeFile(safe(pathname), bytes);
}
export async function readFile(key: string): Promise<Buffer | null> {
  const pathname = keyPath(key);
  if (!pathname) return null;
  if (useBlob()) {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  try { return await read(safe(pathname)); } catch { return null; }
}
export const humanSize = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
