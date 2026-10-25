// The numbers people are asked for when a service needs more than a name and an ID: plate, TIN, UPI, ticket.
// Each is cleaned the same way in the browser and on the server, so what reaches the agent is in one format.
// Pure, safe to import in the browser.
import type { QuestionKind } from "./types";

const squash = (v: string) => v.replace(/\s+/g, " ").trim();

/** Rwandan plates: 2 to 4 letters, 3 or 4 digits, often a final letter (RAD 123 A, RC 123 A, GR 123 A). */
function plate(v: string): string | null {
  const bare = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^([A-Z]{2,4})(\d{3,4})([A-Z]{0,2})$/.exec(bare);
  return m ? [m[1], m[2], m[3]].filter(Boolean).join(" ") : null;
}

/** A TIN or an RDB company code: 9 digits. */
function nineDigits(v: string): string | null {
  const d = v.replace(/\D/g, "");
  return d.length === 9 ? d : null;
}

/** A land parcel's UPI: province/district/sector/cell/parcel, e.g. 1/02/03/04/1234. */
function upi(v: string): string | null {
  const parts = v.replace(/\s/g, "").split(/[/\\-]/);
  if (parts.length !== 5 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const [province, district, sector, cell, parcel] = parts;
  if (province.length !== 1 || district.length > 2 || sector.length > 2 || cell.length > 2 || parcel.length > 6) return null;
  return [province, district.padStart(2, "0"), sector.padStart(2, "0"), cell.padStart(2, "0"), parcel].join("/");
}

function upis(v: string): string | null {
  const list = v.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
  if (!list.length || list.length > 20) return null;
  const clean = list.map(upi);
  return clean.every(Boolean) ? clean.join(", ") : null;
}

/** A police ticket number: letters, digits and dashes, as printed. */
function ticket(v: string): string | null {
  const t = v.toUpperCase().replace(/\s/g, "");
  return /^[A-Z0-9-]{5,24}$/.test(t) ? t : null;
}

/** A date from a date field (YYYY-MM-DD), within a sensible range. */
function date(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const at = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(at);
  if (d.getUTCMonth() !== Number(m[2]) - 1 || Number(m[1]) < 1950 || Number(m[1]) > 2100) return null;
  return v.trim();
}

/** The answer in its standard form, or null when it is not one. Plain text is trimmed and capped. */
export function cleanAnswer(kind: QuestionKind | undefined, value: string): string | null {
  const v = squash(value);
  if (!v) return null;
  switch (kind ?? "text") {
    case "plate": return plate(v);
    case "tin": case "code9": return nineDigits(v);
    case "upi": return upi(v);
    case "upis": return upis(value);
    case "ticket": return ticket(v);
    case "date": return date(v);
    default: return v.slice(0, 200);
  }
}

/** The message key (start.err*) for a wrong answer of this kind. */
export const answerError = (kind: QuestionKind | undefined) =>
  ({ plate: "errPlate", tin: "errTin", code9: "errCode9", upi: "errUpi", upis: "errUpi", ticket: "errTicket", date: "errDate", text: "errAnswer" } as const)[kind ?? "text"];

/** How the field behaves on a phone keyboard. */
export function answerInput(kind: QuestionKind | undefined): { inputMode?: "numeric" | "text"; autoCapitalize?: "characters" | "none" | "sentences"; maxLength?: number; type?: "date" | "text" } {
  switch (kind) {
    case "plate": return { autoCapitalize: "characters", maxLength: 12 };
    case "tin": case "code9": return { inputMode: "numeric", maxLength: 11 };
    case "upi": return { inputMode: "text", maxLength: 24 };
    case "ticket": return { autoCapitalize: "characters", maxLength: 24 };
    case "date": return { type: "date" };
    default: return { autoCapitalize: "sentences", maxLength: 200 };
  }
}

/** Whether a question is asked for the purpose the customer picked (`purposeIndex` is -1 when none is picked). */
export const isAsked = (q: { when?: number[] }, purposeIndex: number) => !q.when?.length || q.when.includes(purposeIndex);
