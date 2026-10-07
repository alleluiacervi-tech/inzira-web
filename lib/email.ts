const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-cased address, or null when it is not a usable mailbox. */
export function normaliseEmail(value: string | null | undefined): string | null {
  const email = (value ?? "").trim().toLowerCase();
  return EMAIL.test(email) && email.length <= 160 ? email : null;
}

/** a•••@example.com — enough to recognise, not enough to read off a shoulder. */
export function maskEmail(email: string): string {
  const [user, host] = email.split("@");
  if (!user || !host) return email;
  const shown = user.length <= 2 ? `${user[0]}•` : `${user.slice(0, 2)}${"•".repeat(Math.min(4, user.length - 2))}`;
  return `${shown}@${host}`;
}
