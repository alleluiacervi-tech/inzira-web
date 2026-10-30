import brand from "./brand.json";

/** A search index must never advertise a development, preview or unconfigured deployment. */
export function searchDeploymentIndexable(settings: { origin?: string; production: boolean; demo: boolean; preview: boolean; officialOrigin?: string }): boolean {
  if (!settings.production || settings.demo || settings.preview || !settings.origin) return false;
  try {
    const url = new URL(settings.origin);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const local = host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host === "::1" || /^127\./.test(host) || host.startsWith("::ffff:7f");
    return (!settings.officialOrigin || url.origin === settings.officialOrigin) && url.protocol === "https:" && !local && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash && !host.endsWith(".vercel.app");
  } catch { return false; }
}

export function publicSearchEnabled(): boolean {
  return searchDeploymentIndexable({
    origin: process.env.NEXT_PUBLIC_SITE_URL,
    officialOrigin: brand.canonicalOrigin,
    production: process.env.NODE_ENV === "production",
    demo: process.env.INZIRA_DEMO === "1",
    preview: process.env.VERCEL_ENV === "preview" || process.env.SEO_NOINDEX === "1",
  });
}
