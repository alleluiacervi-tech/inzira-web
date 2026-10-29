import { getCategoryMark } from "@/lib/repo";

/** The logo an administrator uploaded for a category's institution. Public: it is shown on the public site. The address carries
 *  a revision (?v=) that changes with every upload, so a browser may keep each logo for good. Only PNG, JPEG and WebP are stored. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mark = /^[a-z0-9-]{1,40}$/.test(id) ? await getCategoryMark(id) : null;
  if (!mark) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(new Uint8Array(mark.bytes), {
    headers: {
      "Content-Type": mark.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
