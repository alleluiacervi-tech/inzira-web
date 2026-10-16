// National ID collection and manual review.
// A 16-digit value is only a format check. Nothing here looks up NIDA, Irembo, or any other register,
// and nothing here may be described as an official identity verification.

export type IdPolicy = "required" | "none" | "unsure";
export type IdReview = "pending" | "checked" | "correction" | "unable";
/** What the form should do for this applicant. Business requests never ask for a personal ID number. */
export type IdAsk = "required" | "optional" | "hidden";

const POLICIES: readonly IdPolicy[] = ["required", "none", "unsure"];
const REVIEWS: readonly IdReview[] = ["pending", "checked", "correction", "unable"];

export const isIdPolicy = (v: string | null | undefined): v is IdPolicy => !!v && (POLICIES as readonly string[]).includes(v);
export const isIdReview = (v: string | null | undefined): v is IdReview => !!v && (REVIEWS as readonly string[]).includes(v);

/**
 * The rule for a service. An explicit policy wins. Otherwise a service marked `noId` collects nothing,
 * and anything we have not classified stays optional: an uncertain rule must not make the ID mandatory.
 */
export function idPolicyOf(service: { idPolicy?: string | null; noId?: boolean } | null | undefined): IdPolicy {
  if (isIdPolicy(service?.idPolicy)) return service.idPolicy;
  return service?.noId ? "none" : "unsure";
}

/** Whether this application asks for a personal National ID number. */
export function idAsk(service: { idPolicy?: string | null; noId?: boolean } | null | undefined, forWho: string): IdAsk {
  if (forWho === "business") return "hidden";
  const policy = service ? idPolicyOf(service) : "unsure";
  if (policy === "none") return "hidden";
  if (policy === "required") return "required";
  return "optional";
}

/** Digits only, so a pasted "1 1995 8 0045123 0 17" is judged on the 16 numbers. */
export const nationalIdDigits = (raw: string) => raw.replace(/\D/g, "");

/** null when the value is exactly 16 digits. Empty, short and long are different mistakes. */
export function nationalIdError(digits: string): "empty" | "short" | "long" | null {
  if (!digits) return "empty";
  if (digits.length < 16) return "short";
  if (digits.length > 16) return "long";
  return null;
}

/** True when the text contains a 16-digit run, including one typed with spaces or dashes. */
export function mentionsNationalId(value: string): boolean {
  return /\d{16}/.test(value.replace(/[\s.\-]/g, ""));
}
