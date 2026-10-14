"use client";
import { useCallback } from "react";

type Turnstile = {
  render(el: HTMLElement, o: Record<string, unknown>): string;
  remove(id: string): void;
};
declare global { interface Window { turnstile?: Turnstile } }

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
let loading: Promise<void> | null = null;
const loadScript = () => (loading ??= new Promise<void>((resolve, reject) => {
  const el = document.createElement("script");
  el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  el.async = true; el.onload = () => resolve(); el.onerror = () => { loading = null; reject(new Error("Could not load the check.")); };
  document.head.appendChild(el);
}));

/** Runs the bot check once and resolves with its token, or undefined when the check is off or could not run (the server then decides). */
async function runCheck(): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  try { await loadScript(); } catch { return undefined; }
  const turnstile = window.turnstile;
  if (!turnstile) return undefined;
  // A fresh widget for every send: a token works once. It only appears on screen if the visitor has to do something.
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:0;right:0;bottom:24px;display:flex;justify-content:center;z-index:1000;pointer-events:none";
  document.body.appendChild(holder);
  return new Promise<string | undefined>((resolve) => {
    let id: string | undefined;
    const finish = (token?: string) => { clearTimeout(timer); if (id) turnstile.remove(id); holder.remove(); resolve(token); };
    const timer = setTimeout(() => finish(undefined), 20_000);
    id = turnstile.render(holder, { sitekey: SITE_KEY, appearance: "interaction-only", callback: (t: string) => finish(t), "error-callback": () => finish(undefined), "timeout-callback": () => finish(undefined) });
    holder.style.pointerEvents = "auto";
  });
}

/** `get()` resolves with a bot-check token to send with a code request, or undefined when the check is switched off. */
export function useHuman() {
  const get = useCallback(runCheck, []);
  return { get, enabled: !!SITE_KEY };
}
