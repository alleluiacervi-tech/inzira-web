// Company details shown across the site. Fill these in once before launch.
export const SITE = {
  name: "Inzira",
  legalName: "Inzira Ltd",
  city: "Kigali",
  address: "[Office address]",
  phone: "+250 788 274 354",
  /** Digits only, with country code (e.g. 2507XXXXXXXX). Empty until the real number exists. */
  whatsapp: "250788274354",
  email: "contact@inzira.rw",
  companyCode: "[Company code]",
  tin: "[TIN]",
  hours: "Mon–Fri 8:00–18:00 · Sat 9:00–13:00",
  responseTime: "2 working hours",
  /** Public address of the site, used in SMS links. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "[website]",
};

/** False while a company detail above is still a placeholder ("[TIN]", "+250 7XX XXX XXX"): public pages hide it. */
export const isSet = (value: string) => !!value.trim() && !/\[|X{2}/.test(value);

/** Opens a WhatsApp chat once the number is set; until then it points at the contact block. */
export const whatsappUrl = (text?: string) =>
  SITE.whatsapp ? `https://wa.me/${SITE.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ""}` : "/#contact";
/** tel: link for the phone number ("+250788274354"). */
export const telUrl = () => `tel:${SITE.phone.replace(/[^\d+]/g, "")}`;
export const mailUrl = (subject?: string) => `mailto:${SITE.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;

export const DISCLAIMER =
  "Inzira is a private, independent assistance company. We are not Irembo, RRA, RDB, RURA, the land administration or any government institution, and we do not give legal advice. Official fees and taxes are set and collected by the relevant institution; our assistance fee is separate and always shown on its own line.";

/** The site's absolute origin (e.g. https://inzira.rw), or null while NEXT_PUBLIC_SITE_URL is not set. */
export function siteOrigin(): string | null {
  try { return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").origin; } catch { return null; }
}
