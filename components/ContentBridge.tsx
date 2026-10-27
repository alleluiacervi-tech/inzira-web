"use client";
import { applyContent } from "@/lib/i18n/live";

/**
 * Hands the browser the Kinyarwanda edits the server rendered the page with (lib/content.ts), so text a component reads
 * on screen is the same text the server wrote. It runs while the page renders, before the components after it.
 * On the server it does nothing: the server already holds the current edits (all its bundles share them, lib/i18n/live.ts),
 * and must not swap them for the copy a page was given a moment ago.
 */
export default function ContentBridge({ entries, version }: { entries: Record<string, string>; version: string }) {
  if (typeof window !== "undefined") applyContent(entries, version);
  return null;
}
