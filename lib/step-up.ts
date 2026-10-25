// "Confirm it's you": refunds, payouts, roles, staff accounts and unmasked ID numbers want an authenticator code from
// the last 12 hours (lib/auth.ts STEP_UP_FOR). The action answers with STEP_UP; the console asks for the code
// (components/console/StepUp.tsx) and tries once more. Safe to import in the browser.
export const STEP_UP = "Confirm it’s you: enter the code from your authenticator app.";
export const needsStepUp = (r: { ok: boolean; error?: string }) => !r.ok && r.error === STEP_UP;
