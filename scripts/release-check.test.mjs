import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseChecks } from './lib/release-readiness.mjs';

// Synthetic fixtures, never used for an external request or saved as deployment configuration.
const environment = {
  DATABASE_URL: 'postgresql://fixture.invalid/test', AUTH_SECRET: 'a'.repeat(32), DATA_KEY: '01'.repeat(32),
  NEXT_PUBLIC_SITE_URL: 'https://inziraservices.com', BLOB_READ_WRITE_TOKEN: 'fixture',
  RESEND_API_KEY: 'fixture', EMAIL_FROM: 'fixture@example.org', CUSTOMER_PHONE_SIGNIN: '0', PAYMENT_PROVIDER: 'disabled',
};
const artifact = {headers: [{source: '/:path*', headers: [
  {key: 'Content-Security-Policy', value: "default-src 'self'; upgrade-insecure-requests"},
  {key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains'},
  {key: 'X-Content-Type-Options', value: 'nosniff'},
]}]};
const check = (env = {}, build = artifact) => releaseChecks({...environment, ...env}, build);
const passed = (checks, name) => checks.find(check => check.name === name)?.ok;

test('complete synthetic configuration and production headers pass', () => {
  assert(check().every(check => check.ok));
});
test('runtime production settings cannot approve a demo or missing build', () => {
  for (const build of [undefined, {}, {headers: 'invalid'}, {headers: [null]}, {headers: []}, {headers: [{source: '/:path*', headers: 'invalid'}]}, {headers: [{source: '/:path*', headers: []}]}]) assert.equal(passed(releaseChecks(environment, build), 'Production build policy'), false);
});
test('conditional or partial security headers do not establish production policy', () => {
  const conditional = structuredClone(artifact); conditional.headers[0].has = [{type: 'header', key: 'x-example'}];
  assert.equal(passed(check({}, conditional), 'Production build policy'), false);
  const partial = structuredClone(artifact); partial.headers[0].headers = partial.headers[0].headers.slice(1);
  assert.equal(passed(check({}, partial), 'Production build policy'), false);
});
test('local, insecure, credential-bearing or non-origin public URLs fail', () => {
  for (const url of ['http://release.example.org', 'https://unrelated.example.org', 'https://localhost', 'https://app.localhost', 'https://127.0.0.2', 'https://[::1]', 'https://0.0.0.0', 'https://user:pass@release.example.org', 'https://release.example.org/app', 'https://release.example.org/?key=fixture', 'https://release.example.org/#fixture', 'invalid']) assert.equal(passed(check({NEXT_PUBLIC_SITE_URL: url}), 'Public HTTPS address'), false, url);
});
test('demo mode and active payment providers block this release', () => {
  assert.equal(passed(check({INZIRA_DEMO: '1'}), 'Demo mode disabled'), false);
  for (const provider of ['live', 'intouchpay', 'direct', 'simulator']) assert.equal(passed(check({PAYMENT_PROVIDER: provider}), 'Real-money processing deferred'), false);
});
test('unknown email providers and malformed encryption keys fail', () => {
  assert.equal(passed(check({EMAIL_PROVIDER: 'smpt'}), 'Customer email delivery'), false);
  assert.equal(passed(check({DATA_KEY: 'invalid'}), 'Identity encryption key'), false);
  assert.equal(passed(check({DATA_KEY: Buffer.alloc(32, 1).toString('base64')}), 'Identity encryption key'), true);
});
test('results never include configured credentials', () => {
  const secret = 'sensitive-fixture-do-not-log';
  const result = JSON.stringify(check({SMTP_PASS: secret, BLOB_READ_WRITE_TOKEN: secret}));
  assert(!result.includes(secret));
});

test('a staging noindex switch or preview deployment blocks public release', () => {
  assert.equal(passed(check({SEO_NOINDEX: '1'}), 'Search indexing enabled'), false);
  assert.equal(passed(check({VERCEL_ENV: 'preview'}), 'Search indexing enabled'), false);
});
