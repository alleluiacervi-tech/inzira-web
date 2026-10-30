import assert from "node:assert/strict";
import { searchDeploymentIndexable } from "../lib/search-policy.ts";
import { isIndexable, languageAlternates } from "../lib/seo.ts";
import { publicSitemap } from "../lib/seo-sitemap.ts";
import { brandGraph } from "../lib/brand-schema.ts";
import { publicMetadata, snippet } from "../lib/public-metadata.ts";

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ok  ${name}`); };
const live = { origin: "https://brand.example", production: true, demo: false, preview: false };
check("only configured public production deployments can be indexed", () => {
  assert(searchDeploymentIndexable(live));
  assert(!searchDeploymentIndexable({...live, officialOrigin: "https://inziraservices.com"}));
  assert(searchDeploymentIndexable({...live, origin: "https://inziraservices.com", officialOrigin: "https://inziraservices.com"}));
  for (const override of [{production: false}, {demo: true}, {preview: true}, {origin: undefined}]) assert(!searchDeploymentIndexable({...live, ...override}));
});
check("unsafe, local, preview-host and malformed canonical origins cannot be indexed", () => {
  for (const origin of ["https://localhost", "https://127.0.0.2", "https://[::1]", "https://[::ffff:127.0.0.1]", "https://0.0.0.0", "https://app.localhost", "https://preview.vercel.app", "http://brand.example", "https://person:secret@brand.example", "https://brand.example/path", "https://brand.example/?x=1", "invalid"]) assert(!searchDeploymentIndexable({...live, origin}), origin);
});
check("only useful public landing pages are eligible for indexing", () => {
  for (const path of ["/", "/en", "/services", "/en/services/company-registration", "/about", "/en/track", "/privacy", "/terms"]) assert(isIndexable(path), path);
  for (const path of ["/start", "/en/start/company-registration", "/portal", "/en/portal/account", "/staff", "/sign-in", "/api/health", "/files/private.pdf", "/r/INZ-1", "/brand/image", "/missing", "/services/a/b"]) assert(!isIndexable(path), path);
});
check("canonical and language pairs retain only an explicitly supplied category query", () => {
  const alternate = languageAlternates(live.origin!, "/services?category=tax", "en");
  assert.equal(alternate.canonical, "https://brand.example/en/services?category=tax");
  assert.equal(alternate.languages?.rw, "https://brand.example/services?category=tax");
  assert.equal(alternate.languages?.["x-default"], alternate.languages?.rw);
});
check("sitemap entries have reciprocal language pairs and exclude application/private/empty categories", () => {
  const map = publicSitemap(live.origin!, [{slug:"company-registration",category:"business"}], [{id:"business"},{id:"empty"},{id:"outside",href:"/outside"}]);
  const urls = map.map(entry => entry.url);
  assert.equal(new Set(urls).size, urls.length);
  assert(urls.includes("https://brand.example/en/services?category=business"));
  assert(urls.every(url => !/start|portal|empty|outside/.test(url)));
  for (const item of map) {
    assert(urls.includes(item.alternates!.languages!.en as string));
    assert(urls.includes(item.alternates!.languages!.rw as string));
    assert.equal(item.lastModified, undefined);
  }
});
check("one stable brand entity connects website and services without fabricated trust claims", () => {
  const graph = brandGraph(live.origin!, "Independent paperwork assistance in Rwanda.");
  assert.equal(graph[0]["@id"], "https://brand.example/#organization");
  assert.equal(graph[1].publisher?.["@id"], graph[0]["@id"]);
  assert.equal(graph[0].name, "Inzira");
  assert.equal(graph[0].email, "contact@inziraservices.com");
  assert.equal(graph[0].alternateName, "Inzira Services");
  const data = JSON.stringify(graph);
  assert(!/aggregateRating|reviewCount|award|foundingDate|\[Office address\]|\[TIN\]/.test(data));
});
check("preview and demo catalogue metadata cannot override the deployment noindex policy", () => {
  const previous = process.env.INZIRA_DEMO;
  try {
    process.env.INZIRA_DEMO = "1";
    const metadata = publicMetadata({title:"Company registration",description:"Private application assistance in Rwanda.",path:"/services/company-registration",locale:"en"});
    assert.equal((metadata.robots as {index:boolean}).index, false);
    assert.equal(metadata.openGraph?.title, "Company registration · Inzira");
    assert.equal(metadata.openGraph?.description, metadata.description);
    assert(JSON.stringify(metadata.openGraph).includes("/opengraph-image"));
  } finally { if (previous === undefined) delete process.env.INZIRA_DEMO; else process.env.INZIRA_DEMO = previous; }
});
check("snippets normalize spacing and truncate at words without changing the visible service text", () => {
  assert.equal(snippet("A complete description.", "Additional context ".repeat(20)), "A complete description.");
  assert.equal(snippet("  Inzira  helps ", "with applications."), "Inzira helps with applications.");
  const value = snippet("Company registration assistance in Rwanda. ".repeat(20));
  assert(value.length <= 170 && /[.!?…]$/.test(value));
});
console.log(`SEO checks ok (${passed})`);
