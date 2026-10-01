// Outgoing SMS. Choose a provider with SMS_PROVIDER:
// - "africastalking": needs AT_USERNAME, AT_API_KEY (and optionally AT_SENDER_ID). Not yet tested
//   against a live account — send a test message before relying on it.
// - "console" (default outside production, or with INZIRA_DEMO=1): prints the message to the server log.
// In production without a provider, sending fails loudly instead of silently dropping codes.

export const isDemo = () => process.env.INZIRA_DEMO === "1" || process.env.NODE_ENV !== "production";

export async function sendSms(phone9: string, message: string): Promise<void> {
  const provider = process.env.SMS_PROVIDER ?? (isDemo() ? "console" : "");
  const to = `+250${phone9}`;
  if (provider === "console") {
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
