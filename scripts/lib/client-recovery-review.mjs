// Public regression plus a deliberate Google-Translate-style DOM mutation; no extensions or live providers.
export async function reviewClientRecovery({p, base}) {
  const pages = [];
  const go = async path => { await p.send('Network.setCookie', {name:'inzira_lang',value:path.startsWith('/en') ? 'en' : 'rw',url:base}); await p.go(path); };
  for (const path of ['/', '/en', '/services', '/en/services', '/about', '/en/about', '/privacy', '/en/privacy', '/terms', '/en/terms', '/track', '/en/track', '/start', '/en/start', '/services/company-registration', '/en/services/company-registration', '/services/birth-certificate', '/en/services/birth-certificate']) {
    await go(path);
    for (const width of [360, 768, 1440]) {
      await p.send('Emulation.setDeviceMetricsOverride', {width, height: 900, deviceScaleFactor: 1, mobile: width < 700});
      const result = await p.ev(`({path:location.pathname,width:innerWidth,translate:document.documentElement.getAttribute('translate'),directive:document.querySelector('meta[name="google"]')?.content,guard:!!window.__inziraClientRecovery,overflow:document.documentElement.scrollWidth>innerWidth+1,main:document.querySelectorAll('main').length})`);
      pages.push({...result,errors:[...p.issues.errors]});
    }
  }
  // Every currently listed service, in both supported languages, not just sample details.
  await go('/en/services');
  const servicePaths = await p.ev(`Array.from(new Set([...document.querySelectorAll('.pl-row')].map(a=>a.getAttribute('href')).filter(Boolean)))`);
  if (!servicePaths.length) throw new Error('No service routes found for the full public sweep');
  for (const englishPath of servicePaths) for (const path of [englishPath.replace(/^\/en(?=\/)/,''), englishPath]) {
    await go(path);
    const result = await p.ev(`({path:location.pathname,width:innerWidth,translate:document.documentElement.getAttribute('translate'),directive:document.querySelector('meta[name="google"]')?.content,guard:!!window.__inziraClientRecovery,overflow:document.documentElement.scrollWidth>innerWidth+1,main:document.querySelectorAll('main').length,heading:!!document.querySelector('main h1')})`);
    pages.push({...result,errors:[...p.issues.errors]});
    if (!result.heading || result.path !== path) throw new Error('Service route failed: '+path+' '+JSON.stringify(result));
  }
  const wrapText = `(() => {
    const root = document.querySelector('main');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts = []; let node;
    while (node = walker.nextNode()) if (node.textContent.trim() && !node.parentElement.closest('script,style,textarea,select,svg,font')) texts.push(node);
    for (const text of texts) { const wrapper = document.createElement('font'); wrapper.style.verticalAlign = 'inherit'; text.parentNode.insertBefore(wrapper,text); wrapper.appendChild(text); }
    return texts.length;
  })()`;
  const mutations = [];
  for (const width of [390,1440]) {
    await go('/en/services');
    await p.send('Emulation.setDeviceMetricsOverride', {width, height: 900, deviceScaleFactor: 1, mobile: width < 700});
    const wrapped = await p.ev(wrapText);
    if (!wrapped) throw new Error('Translation mutation fixture did not touch service text');
    await p.set('#cq','passport');
    await p.set('#cq','zzzz-no-service');
    await p.set('#cq','');
    await p.set('#srt','name');
    await p.set('#srt','cost');
    await p.ev(`document.querySelector('.cat-chips button:not([aria-pressed=true])').click(); true`);
    await p.ev(`document.querySelector('.cat-chips button').click(); true`);
    if (width < 700) {
      await p.click('Filters','button');
      await p.ev(wrapText);
      await p.ev(`document.querySelector('.sheet input[type=checkbox]').click(); true`);
      await p.click('Show','button');
    }
    if (p.issues.errors.length || await p.has('Application error: a client-side exception')) throw new Error('Catalogue crashed after translation-style text wrapping: '+p.issues.errors.join('\n'));
    const href = await p.ev(`document.querySelector('.pl-row')?.getAttribute('href')`);
    if (!href) throw new Error('Service result navigation is missing');
    await p.ev(`document.querySelector('.pl-row').click(); true`);
    for(let i=0;i<40 && !(await p.ev(`location.pathname.includes('/services/')`));i++) await new Promise(resolve=>setTimeout(resolve,100));
    if (p.issues.errors.length) throw new Error('Service detail navigation failed after translation mutation');
    mutations.push({width,wrapped,navigated:await p.ev(`location.pathname.includes('/services/')`),errors:[...p.issues.errors]});
  }
  const favicon = await p.ev(`(async()=>{const r=await fetch(${JSON.stringify(base+'/favicon.ico')});const bytes=new Uint8Array(await r.arrayBuffer());return {status:r.status,ico:bytes[0]===0&&bytes[1]===0&&bytes[2]===1&&bytes[3]===0};})()`);
  const failed=pages.filter(r=>r.translate!=='no'||r.directive!=='notranslate'||!r.guard||r.overflow||r.main!==1||r.errors.length);
  return {passed:failed.length===0&&mutations.every(r=>r.navigated)&&favicon.status===200&&favicon.ico,pages,serviceRoutes:servicePaths.length,mutations,favicon};
}
