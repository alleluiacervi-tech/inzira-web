"use client";
import { unstable_rethrow } from "next/navigation";

/** A server action that signs someone in calls redirect(), and that rejects the promise.
 *  Catching every rejection would show an error on a sign-in that worked. */
export function unlessRedirect<T>(fallback: T) {
  return (error: unknown): T => {
    unstable_rethrow(error);
    return fallback;
  };
}
