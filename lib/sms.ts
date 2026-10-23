// Outgoing SMS. Choose a provider with SMS_PROVIDER:
// - "africastalking": needs AT_USERNAME, AT_API_KEY (and optionally AT_SENDER_ID). Not yet tested
//   against a live account — send a test message before relying on it.
// - "console", or no provider at all: prints the message and sign-in shows the code on screen.
//   Africa's Talking is the only provider that sends a real SMS, and it still fails loudly if the call fails.

export const isDemo = () => process.env.INZIRA_DEMO === "1" || process.env.NODE_ENV !== "production";

/** True when a real SMS provider is connected. Otherwise the sign-in code is shown on screen. */
export const sendsRealSms = () => process.env.SMS_PROVIDER === "africastalking";

/** Sign-in codes may be shown on screen only in development and demo builds, and only without a live provider.
 *  On a live site a missing or misspelled SMS_PROVIDER must never turn the sign-in into an open door. */
export const showsCodeOnScreen = () => isDemo() && !sendsRealSms();
/** A code can reach the person: by a real SMS, or on screen in a demo. */
export const canDeliverCodes = () => sendsRealSms() || showsCodeOnScreen();

// Typographic punctuation outside the GSM-7 alphabet turns a whole SMS into UCS-2, which fits
// 70 characters a segment instead of 160. Names from the catalogue and agents' own words can carry it.
const PLAIN: [RegExp, string][] = [[/[‘’‚′]/g, "'"], [/[“”„″]/g, '"'], [/[–—]/g, "-"], [/[·•]/g, "-"], [/…/g, "..."], [/→/g, "->"], [/\u00a0/g, " "]];
export const plainSms = (message: string) => PLAIN.reduce((m, [from, to]) => m.replace(from, to), message);

export async function sendSms(phone9: string, raw: string): Promise<void> {
  const message = plainSms(raw);
  // Deleted accounts keep a placeholder instead of a number; never try to text it.
  if (!/^7\d{8}$/.test(phone9)) throw new Error("Not a Rwandan mobile number; SMS not sent.");
  const provider = process.env.SMS_PROVIDER || (isDemo() ? "console" : "");
  const to = `+250${phone9}`;
  // Demos and development print the message and sign-in shows the code. A live site never does:
  // without a real provider it refuses, so nothing is silently dropped.
  if (provider === "console") {
    if (!isDemo()) throw new Error("SMS_PROVIDER=console only works in development or with INZIRA_DEMO=1.");
    console.log(`[sms] to ${to}: ${message}`);
    return;
  }
  if (provider === "africastalking") {
    const body = new URLSearchParams({ username: process.env.AT_USERNAME ?? "", to, message });
    if (process.env.AT_SENDER_ID) body.set("from", process.env.AT_SENDER_ID);
    const res = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: { apiKey: process.env.AT_API_KEY ?? "", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`SMS provider answered ${res.status}`);
    // A 201 can still carry a refusal for the recipient (no credit, a blocked or invalid number). Only 100–102 are sent.
    const answer = (await res.json().catch(() => null)) as { SMSMessageData?: { Recipients?: { statusCode?: number; status?: string }[] } } | null;
    const recipient = answer?.SMSMessageData?.Recipients?.[0];
    if (!recipient || !recipient.statusCode || recipient.statusCode < 100 || recipient.statusCode > 102) {
      throw new Error(`SMS provider did not send it: ${recipient?.status ?? "no recipient in the answer"}`);
    }
    return;
  }
  throw new Error("SMS is not configured. Set SMS_PROVIDER (see README).");
}
