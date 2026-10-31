"use client";
import { useEffect } from "react";

/** Route boundaries share the pre-hydration DOM recovery handler; ordinary failures still use React reset. */
export function useClientRecovery(error: Error, reset: () => void) {
  useEffect(() => { window.__inziraClientRecovery?.recover(error); }, [error]);
  return () => {
    if (window.__inziraClientRecovery?.requiresRefresh(error)) window.location.reload();
    else reset();
  };
}
