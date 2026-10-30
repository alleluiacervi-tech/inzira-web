// Read-only public-page review. Never signs in, submits a form, or contacts a payment provider.
export async function reviewSeo({ p, base, expectedIndexable, expectedOrigin, sourceHtml = false }) {
  const rows = [], failures = [], links = new Set();
  const assert = (condition, message) => { if (!condition) failures.push(message); };
  const get = path => fetch(base + path, {redirect:'manual', signal:AbortSignal.timeout(20000)});
  await p.send('Network.deleteCookies',{name:'inzira_lang',url:base});
  if(sourceHtml) { const html=await (await get('/en/services')).text(); await p.ev(`window.__seoDoc=new DOMParser().parseFromString(${JSON.stringify(html)},'text/html'); true`); } else await p.go('/en/services');
  const doc=sourceHtml?'window.__seoDoc':'window.document';
  const origin = expectedOrigin || await p.ev(`${doc}.querySelector('link[rel=canonical]')?.href ? new URL(${doc}.querySelector('link[rel=canonical]').href).origin : ''`);
  if (!origin) throw new Error('No canonical origin found. Configure NEXT_PUBLIC_SITE_URL before building the reviewed artifact.');
  const servicePaths = await p.ev(`[...new Set([...${doc}.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>/^\\/en\\/services\\/[^/?#]+$/.test(h)))]`);
  assert(servicePaths.length > 0,'Catalogue exposes no service links');
  const cases = [...new Set(['/', '/en', '/services', '/en/services', '/about', '/en/about', '/privacy', '/en/privacy', '/terms', '/en/terms', '/track', '/en/track', ...servicePaths, ...servicePaths.map(path=>path.replace(/^\/en/,''))])].map(path=>({path,canonical:path,index:expectedIndexable}));
  cases.push(
    {path:'/en/services?category=tax',canonical:'/en/services?category=tax',index:expectedIndexable},
    {path:'/en/services?q=registration',canonical:'/en/services',index:false},
    {path:'/en/services?category=tax&sort=cost&fee=monthly',canonical:'/en/services?category=tax',index:false},
  );
  for (const item of cases) {
    await p.send('Network.deleteCookies',{name:'inzira_lang',url:base});
    const response = await get(item.path);
    assert(response.status === 200,`${item.path}: HTTP ${response.status}`);
    const header = response.headers.get('x-robots-tag') || '';
    assert(!item.index || !/noindex/i.test(header),`${item.path}: production landing page blocked by X-Robots-Tag`);
    if (!expectedIndexable) assert(/noindex/.test(header),`${item.path}: non-production response missing noindex header`);
    if(sourceHtml) { const html=await response.text(); await p.ev(`window.__seoDoc=new DOMParser().parseFromString(${JSON.stringify(html)},'text/html'); true`); } else await p.go(item.path);
    const result = await p.ev(`(() => {
      const document = ${doc};
      const meta = name => document.querySelector('meta[name="'+name+'"],meta[property="'+name+'"]')?.content || '';
      const canonical = document.querySelector('link[rel=canonical]')?.href || '';
      const alternates = Object.fromEntries([...document.querySelectorAll('link[rel=alternate][hreflang]')].map(el=>[el.hreflang,el.href]));
      let structured = [], schemaError = '';
      try { structured = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(el=>{const d=JSON.parse(el.textContent);return d['@graph'] || [d]}); } catch(e) {schemaError=String(e);}
      return {path:${sourceHtml?JSON.stringify(item.path):"location.pathname+location.search"},title:document.title,description:meta('description'),canonical,alternates,lang:document.documentElement.lang,robots:meta('robots'),ogTitle:meta('og:title'),ogDescription:meta('og:description'),ogUrl:meta('og:url'),ogImage:meta('og:image'),googleVerification:meta('google-site-verification'),h1:[...document.querySelectorAll('main h1')].map(el=>el.textContent.trim()),headings:[...document.querySelectorAll('main h1,main h2,main h3')].map(el=>({level:Number(el.tagName.slice(1)),text:el.textContent.trim()})),imagesMissingAlt:document.querySelectorAll('main img:not([alt])').length,localLinks:[...document.querySelectorAll('a[href]')].map(el=>el.getAttribute('href')).filter(h=>h.startsWith('/')&&!h.startsWith('//')),schemaError,structured,errors:[]};
    })()`);
    const actualUrl=new URL(result.path,base), requestedUrl=new URL(item.path,base);
    actualUrl.searchParams.sort(); requestedUrl.searchParams.sort();
    assert(actualUrl.pathname===requestedUrl.pathname && actualUrl.search===requestedUrl.search,`${item.path}: unexpected redirect to ${result.path}`);
    if(process.env.SEO_EXPECT_GOOGLE) assert(result.googleVerification===process.env.SEO_EXPECT_GOOGLE,`${item.path}: Google verification tag missing`);
    assert(result.title.includes('Inzira'),`${item.path}: title missing brand`);
    assert(result.description.length >= 30 && result.description.length <= 170,`${item.path}: description missing or excessively long`);
    assert(result.headings.every((h,i)=>h.text && (!i || h.level<=result.headings[i-1].level+1)),`${item.path}: skipped or empty heading`);
    assert(result.h1.length===1 && result.h1[0],`${item.path}: expected one nonempty main H1`);
    assert(result.canonical===origin+item.canonical,`${item.path}: canonical mismatch (${result.canonical})`);
    const rw = item.canonical.replace(/^\/en(?=\/|$)/,'') || '/';
    assert(result.alternates.rw===origin+rw && result.alternates.en===origin+(rw==='/'?'/en':'/en'+rw) && result.alternates['x-default']===origin+rw,`${item.path}: language alternates mismatch`);
    assert(result.lang===(item.path.startsWith('/en')?'en':'rw'),`${item.path}: HTML language mismatch`);
    assert(item.index ? !/noindex/.test(result.robots) : /noindex/.test(result.robots),`${item.path}: incorrect index directive`);
    assert(result.ogDescription===result.description && new URL(result.ogUrl || base).href===new URL(result.canonical || base).href && result.ogTitle.includes('Inzira'),`${item.path}: social metadata does not match the page`);
    assert(result.ogImage,`${item.path}: missing social preview image`);
    assert(!result.imagesMissingAlt,`${item.path}: image lacks alt attribute`);
    assert(!result.schemaError,`${item.path}: invalid JSON-LD`);
    const organization = result.structured.find(node=>node['@type']==='Organization');
    const website = result.structured.find(node=>node['@type']==='WebSite');
    assert(organization?.['@id']===origin+'/#organization' && organization?.name==='Inzira' && organization?.alternateName==='Inzira Services',`${item.path}: disconnected brand entity`);
    assert(website?.publisher?.['@id']===organization?.['@id'],`${item.path}: website publisher mismatch`);
    for (const node of result.structured.filter(node=>node['@type']==='Service')) assert(node.provider?.['@id']===origin+'/#organization' && node.url===result.canonical,`${item.path}: service provider/canonical mismatch`);
    assert(!p.issues.errors.length,`${item.path}: browser exception`);
    for(const href of result.localLinks) links.add(href);
    rows.push({path:item.path,title:result.title,description:result.description,canonical:result.canonical,h1:result.h1[0],robots:result.robots,schemaTypes:result.structured.map(node=>node['@type'])});
    console.log('SEO_PAGE',JSON.stringify(rows.at(-1)));
  }
  for (const field of ['title','description']) {
    const seen=new Map();
    for(const row of rows) {
      if(seen.has(row[field]) && seen.get(row[field])!==row.canonical) failures.push(`${row.path}: duplicate ${field} across distinct canonical pages`);
      seen.set(row[field],row.canonical);
    }
  }
  const logo=await get('/inzira-mark.svg');
  assert(logo.status===200 && (logo.headers.get('content-type')||'').includes('svg'),'Brand schema logo is not served');
  const robots = await (await get('/robots.txt')).text();
  const sitemap = await (await get('/sitemap.xml')).text();
  if (expectedIndexable) {
    assert(robots.includes(`Sitemap: ${origin}/sitemap.xml`) && !/^Disallow:\s*\/\s*$/m.test(robots),'Production robots blocks public crawling or omits sitemap');
    assert(sitemap.includes('hreflang="en"') && sitemap.includes('hreflang="rw"'),'Sitemap missing language annotations');
    assert(!/<loc>[^<]*\/(portal|console|admin|start|staff|r\/)/.test(sitemap),'Sitemap includes private/application pages');
  } else {
    assert(/^Disallow:\s*\/\s*$/m.test(robots),'Demo/preview robots must block crawling');
    assert(!sitemap.includes('<loc>'),'Demo/preview sitemap must be empty');
  }
  for (const path of ['/start','/en/start/company-registration','/sign-in','/staff','/portal','/console','/r/MISSING']) {
    const response = await get(path);
    assert(/noindex/.test(response.headers.get('x-robots-tag')||''),`${path}: utility/private route missing noindex header`);
  }
  for (const [from,to] of [['/rw/about','/about'],['/en/sign-in','/sign-in'],['/en/portal','/portal']]) {
    const response = await get(from);
    assert(response.status===308 && new URL(response.headers.get('location'),base).pathname===to,`${from}: incorrect duplicate-language redirect`);
  }
  let checkedLinks=0;
  for (const href of links) {
    const url=new URL(href,base);
    if (!/^\/(en(\/|$))?(services|about|privacy|terms)?(\/|$)/.test(url.pathname)) continue;
    const response=await get(url.pathname+url.search);
    assert(response.status < 400,`${href}: broken public link (${response.status})`);
    checkedLinks++;
  }
  return {origin,expectedIndexable,mode:sourceHtml?"server-html":"browser",pages:rows,checkedLinks,failures,passed:!failures.length};
}
