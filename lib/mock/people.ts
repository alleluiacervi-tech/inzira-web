// Seed people for development and demos. Everyone here is fictional.
import type { Account, Profile, Staff } from "../types";

const acc = (id: string, name: string, phone: string, since: string, languages = ["Kinyarwanda", "English"]): Account =>
  ({ id, name, first: name.split(" ")[0], phone, whatsapp: true, languages, since: `${since}T09:00:00+02:00` });

export const ACCOUNTS: Account[] = [
  acc("acc-aline", "Aline Uwase", "+250 788 123 456", "2026-01-14"),
  acc("acc-jc", "Jean Claude Habimana", "+250 788 204 118", "2026-09-30", ["Kinyarwanda"]),
  acc("acc-kff", "Samuel Rukundo", "+250 788 551 902", "2026-03-02"),
  acc("acc-hope", "Josiane Uwera", "+250 783 440 217", "2026-02-19", ["Kinyarwanda", "French"]),
  acc("acc-chantal", "Chantal Mukeshimana", "+250 785 310 664", "2026-09-22", ["Kinyarwanda"]),
  acc("acc-nyamirambo", "Eugène Bizimana", "+250 788 907 335", "2025-11-05"),
  acc("acc-musanze", "Innocent Ndayisaba", "+250 782 118 049", "2026-09-18", ["Kinyarwanda"]),
  acc("acc-emmanuel", "Emmanuel Nsengimana", "+250 788 672 190", "2026-09-25", ["Kinyarwanda", "French"]),
  acc("acc-inema", "Alice Mutesi", "+250 789 225 871", "2026-09-15"),
  acc("acc-ubumwe", "Clarisse Mukamurenzi", "+250 784 663 201", "2026-09-28"),
];

export const PROFILES: (Profile & { nationalId?: string; tin?: string; tinMasked?: string })[] = [
  { id: "p-aline", accountId: "acc-aline", kind: "person", name: "Aline Uwase", relation: "self", idMasked: "1 1995 8 •••• 0 17", nationalId: "1 1995 8 0045123 0 17", district: "Gasabo · Kacyiru" },
  { id: "p-umucyo", accountId: "acc-aline", kind: "business", name: "Umucyo Tech Ltd", tinMasked: "109 ••• 456", tin: "109876456", district: "Gasabo · Kacyiru" },
  { id: "p-ineza", accountId: "acc-aline", kind: "person", name: "Ineza K.", relation: "family", idMasked: "1 2012 7 •••• 0 88", nationalId: "1 2012 7 0012934 0 88", district: "Gasabo · Kacyiru" },
  { id: "p-jc", accountId: "acc-jc", kind: "person", name: "Jean Claude Habimana", relation: "self", idMasked: "1 1987 8 •••• 1 42", nationalId: "1 1987 8 0021345 1 42", district: "Bugesera · Nyamata" },
  { id: "p-kff", accountId: "acc-kff", kind: "business", name: "Kigali Fresh Foods Ltd", tinMasked: "102 ••• 991", tin: "102345991", district: "Nyarugenge · Muhima" },
  { id: "p-hope", accountId: "acc-hope", kind: "organization", name: "Hope Nursery School", tinMasked: "108 ••• 312", tin: "108543312", district: "Kicukiro · Niboye" },
  { id: "p-chantal", accountId: "acc-chantal", kind: "person", name: "Chantal Mukeshimana", relation: "self", idMasked: "1 1990 7 •••• 0 63", nationalId: "1 1990 7 0034129 0 63", district: "Gasabo · Remera" },
  { id: "p-nyamirambo", accountId: "acc-nyamirambo", kind: "business", name: "Nyamirambo Hardware Ltd", tinMasked: "101 ••• 774", tin: "101890774", district: "Nyarugenge · Nyamirambo" },
  { id: "p-musanze", accountId: "acc-musanze", kind: "organization", name: "Musanze Coffee Cooperative", tinMasked: "104 ••• 223", tin: "104671223", district: "Musanze · Muhoza" },
  { id: "p-emmanuel", accountId: "acc-emmanuel", kind: "person", name: "Emmanuel Nsengimana", relation: "self", idMasked: "1 1992 8 •••• 0 08", nationalId: "1 1992 8 0054231 0 08", district: "Kicukiro · Kagarama" },
  { id: "p-inema", accountId: "acc-inema", kind: "business", name: "Inema Traders", tinMasked: "106 ••• 882", tin: "106321882", district: "Gasabo · Kimironko" },
  { id: "p-ubumwe", accountId: "acc-ubumwe", kind: "business", name: "Ubumwe Cyber Café", tinMasked: "105 ••• 661", tin: "105432661", district: "Gasabo · Kimironko" },
];

export const STAFF: Staff[] = [
  { id: "s-eric", name: "Eric Niyonzima", role: "Agent", team: "Tax & EBM", title: "Senior agent · Tax & EBM", active: true },
  { id: "s-grace", name: "Grace Ingabire", role: "Agent", team: "Business registration", title: "Agent · Business registration", active: true },
  { id: "s-patrick", name: "Patrick Nshimiyimana", role: "Agent", team: "Land & RURA", title: "Agent · Land & RURA", active: true },
  { id: "s-olivier", name: "Olivier Mugisha", role: "Agent", team: "Irembo training", title: "Trainer · Irembo", active: true },
  { id: "s-claudine", name: "Claudine Uwimana", role: "Agent", team: "Taxes", title: "Agent · Taxes", active: true },
  { id: "s-jp", name: "Jean Paul Hakizimana", role: "Supervisor", team: "Operations", title: "Supervisor", active: true },
  { id: "s-solange", name: "Solange Ishimwe", role: "Finance", team: "Finance", title: "Finance officer", active: true },
  { id: "s-diane", name: "Diane Mukamana", role: "Owner", team: "Management", title: "Owner · Administrator", active: true },
];
