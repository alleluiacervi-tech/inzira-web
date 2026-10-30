import { isSet, SITE } from "./site";

/** Shared, stable entity IDs tie every service and page to the same business. No invented credentials or reviews. */
export function brandGraph(origin: string, description: string) {
  return [
    {
      "@type": "Organization", "@id": `${origin}/#organization`, name: SITE.name, alternateName: SITE.alternateName, legalName: SITE.legalName,
      url: origin, description,
      logo: { "@type": "ImageObject", "@id": `${origin}/#logo`, url: `${origin}/inzira-mark.svg`, width: 256, height: 256, caption: SITE.name },
      email: isSet(SITE.email) ? SITE.email : undefined, telephone: isSet(SITE.phone) ? SITE.phone : undefined,
      areaServed: { "@type": "Country", name: "Rwanda" },
      address: { "@type": "PostalAddress", addressLocality: SITE.city, addressCountry: "RW", ...(isSet(SITE.address) ? { streetAddress: SITE.address } : {}) },
    },
    { "@type": "WebSite", "@id": `${origin}/#website`, name: SITE.name, alternateName: SITE.alternateName, url: origin, inLanguage: ["rw", "en"], publisher: { "@id": `${origin}/#organization` } },
  ];
}
