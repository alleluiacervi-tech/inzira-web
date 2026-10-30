// Read-only configuration and artifact preflight. Never sends messages or prints credentials.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nextEnv from '@next/env';
import { releaseChecks } from './lib/release-readiness.mjs';

nextEnv.loadEnvConfig(process.cwd(), false);
let artifact;
try { artifact = JSON.parse(readFileSync(resolve('.next/routes-manifest.json'), 'utf8')); } catch { /* Missing/corrupt artifacts are a failed check, not a skipped one. */ }
const checks = releaseChecks(process.env, artifact);
for (const {name, ok, action} of checks) console.log(`${ok ? 'PASS' : 'BLOCKED'} ${name}${ok ? '' : `: ${action}`}`);
const failed = checks.filter(check => !check.ok).length;
console.log(failed ? `\n${failed} deployment prerequisite(s) remain. No external operation was performed.` : '\nConfiguration and build-policy preflight passed. Still verify live database access, delivery, private storage, backups, monitoring and HTTPS before launch.');
process.exitCode = failed ? 1 : 0;
