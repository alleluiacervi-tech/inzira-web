// Outgoing SMS. Choose a provider with SMS_PROVIDER:
// - "africastalking": needs AT_USERNAME, AT_API_KEY (and optionally AT_SENDER_ID). Not yet tested
//   against a live account — send a test message before relying on it.
// - "console", or no provider at all: prints the message and sign-in shows the code on screen.
//   Africa's Talking is the only provider that sends a real SMS, and it still fails loudly if the call fails.

export const isDemo = () => process.env.INZIRA_DEMO === "1" || process.env.NODE_ENV !== "production";

/** True when a real SMS provider is connected. Otherwise the sign-in code is shown on screen. */
export const sendsRealSms = () => process.env.SMS_PROVIDER === "africastalking";

export async function sendSms(phone9: string, message: string): Promise<void> {
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
