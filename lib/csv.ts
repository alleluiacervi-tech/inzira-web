/** Quote spreadsheet cells and keep untrusted text from becoming an executable formula. */
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (typeof value !== "number" && /^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
