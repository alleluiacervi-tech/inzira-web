// Optional bot check (Cloudflare Turnstile) for the forms that send a code by email or SMS, so a script cannot use up the
// daily email allowance or run up the SMS bill. Off until both keys are set:
//   NEXT_PUBLIC_TURNSTILE_SITE_KEY   public, used by the page
//   TURNSTILE_SECRET_KEY             private, used here
// Server only.

export const turnstileEnabled = () => !!process.env.TURNSTILE_SECRET_KEY && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** True when the visitor passed the check (or the check is off). Fails closed: if Cloudflare cannot be reached, the code is not sent. */
export async function verifyHuman(token: string | undefined, ip?: string): Promise<boolean> {
  if (!turnstileEnabled()) return true;
  if (!token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token });
    if (ip && ip !== "unknown" && ip !== "local") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch (e) {
    console.error("[turnstile]", e);
    return false;
  }
}
