import type { Category } from "./types";

/**
 * Offices a request is filed with. `mark` is that office's own logo, used only to name
 * the destination on the home rail. Inzira does not represent them and is not endorsed by them.
 * CIV has no mark: the code is ours, for civil registration and identity papers, so the rail
 * shows the words and never an invented seal.
 * These are the offices the site shipped with. A category an administrator adds is its own office, named and given a logo
 * in the console (officesFor).
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

export type Office = {
  code: string; name: string; area: string; does: string; cats: readonly string[]; href: string; mark: string | null;
  /** True for an office made from a category: its text is already in the reader's language (localizeCategory). */
  fromCategory: boolean;
};

/** The offices the site shows: the built-in ones whose categories are on the site, then one for each category that names an
 *  institution or has a logo of its own. Pass the categories in the reader's language so the extra offices read in it. */
export function officesFor(categories: readonly Category[]): Office[] {
  const shown = new Set(categories.filter((c) => c.visible !== false).map((c) => c.id));
  const builtIn = OFFICES.filter((o) => o.cats.some((id) => shown.has(id))).map((o): Office => ({ ...o, fromCategory: false }));
  const covered = new Set<string>(OFFICES.flatMap((o) => o.cats));
  const own = categories
    .filter((c) => c.visible !== false && !c.href && !covered.has(c.id) && (c.institution || c.mark))
    .map((c): Office => ({ code: c.id, name: c.institution || c.name, area: c.short, does: c.desc, cats: [c.id], href: `/services?category=${c.id}`, mark: c.mark ?? null, fromCategory: true }));
  return [...builtIn, ...own];
}

/** The office a service category is filed with, if any ("other" has none). */
export const officeFor = (category: string, categories: readonly Category[]) => officesFor(categories).find((o) => o.cats.includes(category));
