// The icons an administrator can give a category (they are drawn in components/icons.ts).
export const CATEGORY_ICONS: { name: string; label: string }[] = [
  { name: "c-biz", label: "Business" },
  { name: "c-tax", label: "Taxes" },
  { name: "c-ebm", label: "EBM" },
  { name: "c-land", label: "Land" },
  { name: "c-car", label: "Vehicles" },
  { name: "c-id", label: "Identity" },
  { name: "c-comp", label: "Certificates" },
  { name: "c-learn", label: "Training" },
  { name: "c-court", label: "Courts" },
  { name: "c-health", label: "Health" },
  { name: "c-book", label: "Education" },
  { name: "c-bank", label: "Finance" },
  { name: "c-home", label: "Housing" },
  { name: "c-travel", label: "Travel" },
  { name: "c-bolt", label: "Utilities" },
  { name: "c-shield", label: "Safety" },
  { name: "c-people", label: "People" },
  { name: "c-other", label: "Other" },
];
export const isCategoryIcon = (name: string) => CATEGORY_ICONS.some((i) => i.name === name);
