/** Runs before hydration; no application imports, client data, network calls or form replay. */
export const CLIENT_RECOVERY_BOOTSTRAP = String.raw`(() => {
  if (window.__inziraClientRecovery) return;
  var key = 'inzira:client-recovery:v1';
  var dirty = false;
  var reloading = false;
  function requiresRefresh(error) {
    var message = '';
    try { message = typeof error === 'string' ? error : error && typeof error.message === 'string' ? error.message : ''; } catch (_) { return false; }
    return /(?:removeChild|insertBefore)/i.test(message) && /(?:not a child|node to be removed|node before which|NotFoundError)/i.test(message);
  }
  function notice() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', notice, { once: true }); return; }
    if (document.getElementById('inzira-recovery-notice')) return;
    var box = document.createElement('div');
    box.id = 'inzira-recovery-notice';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;z-index:2147483647;left:16px;right:16px;bottom:20px;margin:auto;max-width:620px;padding:16px 20px;border:1px solid #dce5f2;border-radius:12px;background:#fff;color:#17365e;box-shadow:0 8px 40px #102d5b30;font:14px/1.6 system-ui,sans-serif;display:flex;align-items:center;gap:16px;flex-wrap:wrap';
    var text = document.createElement('span');
    var rw = document.documentElement && document.documentElement.lang === 'rw';
    text.textContent = rw ? (navigator.onLine === false ? 'Interineti isa n’idahari. Ongera uyihuze, wongere ufungure uru rupapuro. Amakuru utarabika ushobora kongera kuyandika.' : 'Uru rupapuro rugomba kongera gufungurwa. Amakuru utarabika ushobora kongera kuyandika.') : (navigator.onLine === false ? 'You appear to be offline. Reconnect, then refresh this page. Unsaved entries may need to be entered again.' : 'This page needs a fresh load. Refresh to continue. Unsaved entries may need to be entered again.');
    text.style.cssText = 'flex:1;min-width:180px';
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = rw ? 'Ongera ufungure' : 'Refresh page';
    button.style.cssText = 'padding:10px 16px;border:0;border-radius:8px;background:#173f79;color:white;font:inherit;cursor:pointer';
    button.onclick = function () { window.location.reload(); };
    box.appendChild(text); box.appendChild(button); document.body.appendChild(box);
  }
  function refresh() {
    if (reloading) return true;
    // Keep unfinished input and payment screens under the user's control.
    if (dirty || navigator.onLine === false || /\/pay(?:\/|$)/.test(window.location.pathname)) { notice(); return false; }
    try {
      var now = Date.now();
      var previous = Number(window.sessionStorage.getItem(key));
      if (previous > 0 && now - previous < 300000) { notice(); return false; }
      window.sessionStorage.setItem(key, String(now));
    } catch (_) { notice(); return false; } // Without a persistent guard, never risk a reload loop.
    reloading = true;
    window.location.reload();
    return true;
  }
  window.__inziraClientRecovery = {
    requiresRefresh: requiresRefresh,
    recover: function (error) { return requiresRefresh(error) ? refresh() : false; }
  };
  function edited(event) {
    var tag = event.target && event.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'INPUT' && !/^(hidden|button|submit|reset)$/i.test(event.target.type || '')) dirty = true;
  }
  document.addEventListener('input', edited, true);
  document.addEventListener('change', edited, true);
  window.addEventListener('error', function (event) {
    if (requiresRefresh(event.error || event.message)) refresh();
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    if (requiresRefresh(event.reason)) refresh();
  });
})();`;

declare global {
  interface Window {
    __inziraClientRecovery?: {
      requiresRefresh: (error: unknown) => boolean;
      recover: (error: unknown) => boolean;
    };
  }
}
