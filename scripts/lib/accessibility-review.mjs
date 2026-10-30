// Accessibility-tree and text/reflow stress checks complement a real screen-reader session.
export async function reviewAccessibility({ p, signIn, signOut, sleep }) {
  const pages = [];
  const controls = new Set(['button', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'link']);
  await p.send('Accessibility.enable');
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  async function inspect(path) {
    for (const mode of ['desktop', 'reflow-200', 'text-200']) {
      await p.send('Emulation.setDeviceMetricsOverride', {width: mode === 'reflow-200' ? 720 : 1440, height: mode === 'reflow-200' ? 500 : 1000, deviceScaleFactor: mode === 'reflow-200' ? 2 : 1, mobile: false});
      await p.go(path);
      if (mode === 'text-200') await p.ev(`(() => {
        const items = [...document.querySelectorAll('body *')].filter(el => el instanceof HTMLElement && el.getClientRects().length);
        const sizes = items.map(el => parseFloat(getComputedStyle(el).fontSize));
        items.forEach((el, i) => { if (sizes[i]) el.style.fontSize = (sizes[i] * 2) + 'px'; });
        return true;
      })()`);
      await sleep(150);
      const tree = await p.send('Accessibility.getFullAXTree');
      const nodes = tree.result.nodes.filter(node => !node.ignored);
      const unnamed = nodes.filter(node => controls.has(node.role?.value) && !node.name?.value?.trim()).map(node => ({role: node.role.value, backendNodeId: node.backendDOMNodeId}));
      const layout = await p.ev(`(() => {
        const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
        const clipped = [...document.querySelectorAll('main button, main input:not([type=checkbox]):not([type=radio]), main select, main textarea')].filter(visible).filter(el => {
          const css = getComputedStyle(el);
          return !el.disabled && !['hidden', 'file'].includes(el.type) && css.textOverflow !== 'ellipsis' && el.scrollHeight > el.clientHeight + 4;
        }).map(el => ({tag: el.tagName, id: el.id, text: (el.getAttribute('aria-label') || el.textContent || el.placeholder || '').trim().slice(0, 80), height: el.clientHeight, contentHeight: el.scrollHeight}));
        return {path: location.pathname, overflow: document.documentElement.scrollWidth > innerWidth + 1, clippedControls: clipped};
      })()`);
      const result = {requested: path, mode, ...layout, mainLandmarks: nodes.filter(node => node.role?.value === 'main').length, unnamed, errors: [...p.issues.errors]};
      pages.push(result); console.log(JSON.stringify(result));
    }
  }
  for (const path of ['/en', '/en/services', '/en/services/company-registration', '/start/company-registration', '/sign-in', '/track', '/does-not-exist']) await inspect(path);
  await p.go('/sign-in'); await p.set('#si-contact', 'not-an-email'); await p.click('Send me a code', 'button'); await sleep(200);
  const alertsTree = await p.send('Accessibility.getFullAXTree');
  const errorAnnouncement = alertsTree.result.nodes.some(node => !node.ignored && node.role?.value === 'alert' && node.properties?.some(prop => prop.name === 'live' && prop.value.value === 'assertive'));
  await signIn(p, 'aline.uwase@example.com');
  for (const path of ['/portal', '/portal/requests', '/portal/documents', '/portal/account', '/portal/requests/INZ-2026-04761/pay']) await inspect(path);
  await signOut(p); await signIn(p, 'admin@inzira.test');
  for (const path of ['/console/overview', '/console/requests', '/console/clients/p-aline', '/console/intake', '/admin/roles']) await inspect(path);
  await p.send('Emulation.setDeviceMetricsOverride', {width: 1280, height: 900, deviceScaleFactor: 1, mobile: false});
  await p.go('/console/clients/p-aline');
  await p.ev(`document.querySelector('[role=tab][aria-selected=true]').focus(); true`);
  await p.send('Input.dispatchKeyEvent', {type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  const arrowWorks = await p.ev(`document.activeElement.getAttribute('role') === 'tab' && document.activeElement.textContent.includes('Requests') && document.querySelector('[role=tabpanel]').getAttribute('aria-labelledby') === document.activeElement.id`);
  await p.send('Input.dispatchKeyEvent', {type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35});
  const endWorks = await p.ev(`document.activeElement.textContent.includes('Activity') && document.activeElement.getAttribute('aria-selected') === 'true'`);
  await p.send('Input.dispatchKeyEvent', {type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36});
  const homeWorks = await p.ev(`document.activeElement.textContent.includes('Overview') && document.activeElement.getAttribute('aria-selected') === 'true'`);
  await p.set('input[aria-label="Add client tag"]', 'unsent-review-tag');
  await p.send('Network.setBlockedURLs', {urls: [new URL('/console/clients/p-aline', await p.ev('location.origin')).href]});
  await p.click('Add tag', 'button');
  for (let i=0;i<40 && !(await p.has('The tag could not be confirmed'));i++) await sleep(250);
  const tagRecovery = await p.has('The tag could not be confirmed') && await p.ev(`document.querySelector('input[aria-label="Add client tag"]').value === 'unsent-review-tag'`);
  await p.send('Network.setBlockedURLs', {urls: []});
  await p.go('/console/clients/p-aline'); await p.click('Notes (', 'button');
  await p.set('[role=tabpanel] textarea', 'Unsent note: network recovery check.');
  await p.send('Network.setBlockedURLs', {urls: [new URL('/console/clients/p-aline', await p.ev('location.origin')).href]});
  await p.click('Save note', 'button');
  for (let i=0;i<40 && !(await p.has('The note could not be confirmed'));i++) await sleep(250);
  const noteRecovery = await p.has('The note could not be confirmed') && await p.ev(`document.querySelector('[role=tabpanel] textarea').value === 'Unsent note: network recovery check.'`);
  await p.send('Network.setBlockedURLs', {urls: []});
  const clientInteraction = {arrowWorks,endWorks,homeWorks,tagRecovery,noteRecovery};
  await p.go('/console/overview'); await p.click('New', 'button'); await p.click('Add new client', 'button');
  const dialogTree = await p.send('Accessibility.getFullAXTree');
  const modalSemantics = dialogTree.result.nodes.some(node => !node.ignored && node.role?.value === 'dialog' && node.name?.value && node.properties?.some(prop => prop.name === 'modal' && prop.value.value === true));
  await p.send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  const failed = pages.filter(result => result.overflow || result.mainLandmarks !== 1 || result.unnamed.length || result.clippedControls.length || result.errors.length);
  return {pages, errorAnnouncement, modalSemantics, clientInteraction, passed: !failed.length && errorAnnouncement && modalSemantics && Object.values(clientInteraction).every(Boolean)};
}
