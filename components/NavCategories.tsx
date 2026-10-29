"use client";
import { createContext, useContext } from "react";
import type { Category } from "@/lib/types";

const Ctx = createContext<Category[]>([]);

/** The categories in the public menu, loaded once by the layout (lib/nav-categories.ts). */
export function NavCategoriesProvider({ categories, children }: { categories: Category[]; children: React.ReactNode }) {
  return <Ctx.Provider value={categories}>{children}</Ctx.Provider>;
}
export const useNavCategories = () => useContext(Ctx);
