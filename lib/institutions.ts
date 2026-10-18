/**
 * Offices a request is filed with. `mark` is that office's own logo, used only to name
 * the destination on the home rail. Inzira does not represent them and is not endorsed by them.
 * CIV has no mark: the code is ours, for civil registration and identity papers, so the rail
 * shows the words and never an invented seal.
 */
export const OFFICES = [
  { code: "RDB", name: "Rwanda Development Board", area: "Business registration", cats: ["rdb"], does: "Register an enterprise or company, change its details, file the annual return", href: "/services?category=rdb", mark: "/offices/rdb.png" },
  { code: "RRA", name: "Rwanda Revenue Authority", area: "Taxes and EBM", cats: ["tax", "ebm"], does: "Trading licence, TIN, monthly and yearly declarations, EBM installation and training", href: "/services?category=tax", mark: "/offices/rra.png" },
  { code: "NLA", name: "National Land Authority", area: "Land, filed on Irembo", cats: ["land"], does: "E-titles, adding or removing a spouse in the land register, merging plots", href: "/services?category=land", mark: "/offices/nla.png" },
  { code: "RURA", name: "Rwanda Utilities Regulatory Authority", area: "Transport", cats: ["rura"], does: "Authorisations for passenger and goods vehicles, and their suspension", href: "/services?category=rura", mark: "/offices/rura.png" },
  { code: "RNP", name: "Rwanda National Police", area: "Filed on Irembo", cats: ["police"], does: "Driving licences, traffic fines, test booking, vehicle inspection and a criminal record certificate", href: "/services?category=police", mark: "/offices/rnp.png" },
  { code: "CIV", name: "Civil registration and identity", area: "Filed on Irembo", cats: ["papers"], does: "Birth, marriage and other certificates, a passport and a replacement ID card", href: "/services?category=papers", mark: null },
  { code: "Irembo", name: "Irembo", area: "Government services portal", cats: ["irembo"], does: "We file through it for you, or train you and your staff to use it yourselves", href: "/services?category=irembo", mark: "/offices/irembo.svg" },
] as const;

/** The office a service category is filed with, if any ("other" has none). */
export const officeFor = (category: string) => OFFICES.find((o) => (o.cats as readonly string[]).includes(category));
