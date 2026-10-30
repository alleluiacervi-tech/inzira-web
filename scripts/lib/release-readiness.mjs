import brand from "../../lib/brand.json" with { type: "json" };

// Pure release checks: return names/status only, never environment or credential values.
export function releaseChecks(environment, artifact) {
  const value = name => environment[name]?.trim() ?? '';
  const result = [];
  const check = (name, ok, action) => result.push({name, ok: Boolean(ok), action});
  const urlUses = (raw, protocols) => {
    try { return protocols.includes(new URL(raw).protocol); } catch { return false; }
  };
  const publicOrigin = raw => {
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      const loopback = host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0' || /^127\./.test(host) || host.startsWith('::ffff:7f');
      return url.origin === brand.canonicalOrigin && url.protocol === 'https:' && !loopback && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
    } catch { return false; }
  };
  check('Search indexing enabled', value('SEO_NOINDEX') !== '1' && value('VERCEL_ENV') !== 'preview', 'Remove SEO_NOINDEX=1 and use the production deployment for launch; staging and previews must remain noindex.');
  check('Demo mode disabled', value('INZIRA_DEMO') !== '1', 'Remove INZIRA_DEMO=1 from the production deployment.');
  check('Persistent Postgres', urlUses(value('DATABASE_URL'), ['postgres:', 'postgresql:']), 'Configure DATABASE_URL for the production database.');
  check('Authentication secret', value('AUTH_SECRET').length >= 32, 'Configure a unique AUTH_SECRET of at least 32 characters.');
  const key = value('DATA_KEY');
  check('Identity encryption key', /^[a-f\d]{64}$/i.test(key) || (/^[A-Za-z\d+/]{43}=$/.test(key) && Buffer.from(key, 'base64').length === 32), 'Configure a 32-byte DATA_KEY and retain a secure backup.');
  check('Public HTTPS address', publicOrigin(value('NEXT_PUBLIC_SITE_URL')), 'Set NEXT_PUBLIC_SITE_URL to the owner-confirmed Inzira HTTPS origin in lib/brand.json, without credentials, a subpath, query or fragment, before building.');
  check('Private file storage', value('BLOB_READ_WRITE_TOKEN') || (value('BLOB_STORE_ID') && value('VERCEL_OIDC_TOKEN')), 'Connect private Vercel Blob storage and verify file permissions on the deployment.');
  const resend = value('RESEND_API_KEY') && value('EMAIL_FROM');
  const smtp = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].every(name => value(name)) && (value('SMTP_FROM') || value('EMAIL_FROM'));
  const mode = value('EMAIL_PROVIDER');
  check('Customer email delivery', mode === 'smtp' ? smtp : mode === 'resend' ? resend : mode === '' && (resend || smtp), 'Configure EMAIL_PROVIDER as resend or smtp (or omit it), with the corresponding credentials, then verify delivery.');
  check('Customer phone sign-in', value('CUSTOMER_PHONE_SIGNIN') === '0' || (value('SMS_PROVIDER') === 'africastalking' && value('AT_USERNAME') && value('AT_API_KEY')), 'Configure SMS delivery, or use CUSTOMER_PHONE_SIGNIN=0. Staff without email and SMS-dependent workflows still need SMS delivery.');
  check('Real-money processing deferred', !value('PAYMENT_PROVIDER') || value('PAYMENT_PROVIDER') === 'disabled', 'Leave PAYMENT_PROVIDER unset or disabled for this release.');
  // Runtime variables alone cannot turn an HTTP demo artifact into a production build.
  const rules = Array.isArray(artifact?.headers) ? artifact.headers : [];
  const globalHeaders = rules.filter(rule => rule?.source === '/:path*' && !rule.has?.length && !rule.missing?.length).flatMap(rule => Array.isArray(rule.headers) ? rule.headers : []);
  const header = name => globalHeaders.find(entry => typeof entry?.key === 'string' && entry.key.toLowerCase() === name && typeof entry.value === 'string')?.value ?? '';
  const csp = header('content-security-policy').split(';').map(directive => directive.trim());
  const hsts = /(?:^|;)\s*max-age=(\d+)/i.exec(header('strict-transport-security'));
  check('Production build policy', csp.includes('upgrade-insecure-requests') && Number(hsts?.[1]) >= 31536000 && header('x-content-type-options').toLowerCase() === 'nosniff', 'Run npm run build without INZIRA_DEMO=1. Do not publish a demo artifact; missing or malformed build manifests also block release.');
  return result;
}
