import { runAndRecord } from "@/lib/jobs";

// Scheduled by vercel.json. Vercel sends "Authorization: Bearer $CRON_SECRET" when CRON_SECRET is
// set; any other scheduler can call it the same way.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const result = await runAndRecord();
  return Response.json({ at: new Date().toISOString(), ...result }, { status: result.ok ? 200 : 500 });
}
