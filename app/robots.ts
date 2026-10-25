import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";

// Public pages are indexed; every signed-in area, file and API route is not.
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/portal", "/admin", "/console", "/files", "/api", "/sign-in", "/r/"] },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
