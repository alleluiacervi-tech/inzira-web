// The database (files table) records who may read each uploaded file. Vercel Blob is private;
// access is still checked by the authenticated file route before bytes are returned.
// Without Blob credentials files go to local disk — allowed in development and in demo builds
// (INZIRA_DEMO=1), refused in production.
import { mkdir, readFile as read, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";

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

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);
/** What a file really is, from its first bytes. The type a browser reports is chosen by the sender and proves nothing. */
export function sniffType(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "application/pdf" | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && ascii(b, 1, 4) === "PNG" && b[4] === 0x0d && b[5] === 0x0a) return "image/png";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp";
  if (ascii(b, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(b, 8, 12))) return "image/heic";
  // A PDF may begin with a few bytes of junk, but its header sits within the first kilobyte.
  if (ascii(b, 0, Math.min(b.length, 1024)).includes("%PDF-")) return "application/pdf";
  return null;
}
/** Checks a browser File against the size and type rules, by its content. Returns the content type to store, or null. */
export async function checkUpload(f: File): Promise<string | null> {
  if (f.size > MAX_BYTES || !ALLOWED.test(f.type)) return null;
  return sniffType(new Uint8Array(await f.slice(0, 1100).arrayBuffer()));
}

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
/** Removes the stored bytes. Missing files are not an error: deleting twice is safe. */
export async function deleteFile(key: string): Promise<void> {
  const pathname = keyPath(key);
  if (!pathname) return;
  if (useBlob()) { await del(pathname); return; }
  await rm(safe(pathname), { force: true });
}
export const humanSize = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
