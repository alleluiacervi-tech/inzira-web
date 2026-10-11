// Outgoing SMS. Choose a provider with SMS_PROVIDER:
// - "africastalking": needs AT_USERNAME, AT_API_KEY (and optionally AT_SENDER_ID). Not yet tested
//   against a live account — send a test message before relying on it.
// - "console", or no provider at all: prints the message and sign-in shows the code on screen.
//   Africa's Talking is the only provider that sends a real SMS, and it still fails loudly if the call fails.

export const isDemo = () => process.env.INZIRA_DEMO === "1" || process.env.NODE_ENV !== "production";

/** True when a real SMS provider is connected. Otherwise the sign-in code is shown on screen. */
export const sendsRealSms = () => process.env.SMS_PROVIDER === "africastalking";

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
  // No provider yet: print the message and let sign-in show the code. A live site with
  // SMS_PROVIDER=africastalking still sends, and still fails loudly if that call fails.
  if (provider === "console" || provider === "") {
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
    return;
  }
  throw new Error("SMS is not configured. Set SMS_PROVIDER (see README).");
}
