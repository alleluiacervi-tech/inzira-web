/**
 * The institutions requests are filed with, shown as plain text labels. Never their logos:
 * Inzira is not affiliated with them, and the labels only say where a request goes.
 */
export const OFFICES = [
  { code: "RDB", name: "Rwanda Development Board", area: "Business registration", cats: ["rdb"], does: "Register an enterprise or company, change its details, file the annual return", href: "/services?category=rdb" },
  { code: "RRA", name: "Rwanda Revenue Authority", area: "Taxes and EBM", cats: ["tax", "ebm"], does: "Trading licence, TIN, monthly and yearly declarations, EBM installation and training", href: "/services?category=tax" },
  { code: "NLA", name: "National Land Authority", area: "Land, filed on Irembo", cats: ["land"], does: "E-titles, adding or removing a spouse in the land register, merging plots", href: "/services?category=land" },
  { code: "RURA", name: "Rwanda Utilities Regulatory Authority", area: "Transport", cats: ["rura"], does: "Authorisations for passenger and goods vehicles, and their suspension", href: "/services?category=rura" },
  { code: "Irembo", name: "Irembo", area: "Government services portal", cats: ["irembo"], does: "We file through it for you, or train you and your staff to use it yourselves", href: "/services?category=irembo" },
] as const;

/** The office a service category is filed with, if any ("other" has none). */
export const officeFor = (category: string) => OFFICES.find((o) => (o.cats as readonly string[]).includes(category));
