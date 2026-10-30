import type { MetadataRoute } from "next";
import type { Category, Service } from "./types";

/** Accept only the visible catalogue supplied by the repository; never invent modification dates. */
export function publicSitemap(origin: string, services: Pick<Service, "slug" | "category">[], categories: Pick<Category, "id" | "href">[]): MetadataRoute.Sitemap {
  const used = new Set(services.map(service => service.category));
  const paths = ["/", "/services", ...services.map(s => `/services/${s.slug}`), ...categories.filter(c => !c.href && used.has(c.id)).map(c => `/services?category=${encodeURIComponent(c.id)}`), "/about", "/track", "/privacy", "/terms"];
  return [...new Set(paths)].flatMap(path => {
    const rw = `${origin}${path}`;
    const en = `${origin}${path === "/" ? "/en" : `/en${path}`}`;
    return [rw, en].map(url => ({ url, alternates: { languages: { rw, en, "x-default": rw } } }));
  });
}
