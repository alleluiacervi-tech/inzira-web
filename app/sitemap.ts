import type { MetadataRoute } from "next";
import { listServices } from "@/lib/repo";
import { siteOrigin } from "@/lib/site";

// Built on request from the live catalogue, never frozen at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Search engines need absolute addresses, so there is no sitemap until NEXT_PUBLIC_SITE_URL is set.
  const origin = siteOrigin();
  if (!origin) return [];
  const services = await listServices();
  const pages: { path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/services", changeFrequency: "weekly", priority: 0.9 },
    ...services.map((s) => ({ path: `/services/${s.slug}`, changeFrequency: "monthly" as const, priority: 0.8 })),
    { path: "/about", changeFrequency: "monthly", priority: 0.5 },
    { path: "/start", changeFrequency: "monthly", priority: 0.6 },
    { path: "/track", changeFrequency: "yearly", priority: 0.3 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  ];
  // Kinyarwanda is the unprefixed address. English is the same page under /en.
  return pages.flatMap((page) => {
    const rw = page.path === "/" ? "/" : page.path;
    const en = page.path === "/" ? "/en" : `/en${page.path}`;
    return [rw, en].map((path) => ({ url: `${origin}${path}`, changeFrequency: page.changeFrequency, priority: page.priority }));
  });
}
