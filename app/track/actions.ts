"use server";
import { allowIp } from "@/lib/ratelimit";
import { trackRequest } from "@/lib/repo";

/** Looks a request up for someone who is not signed in. Runs on the server so the reference and
 *  email or phone number are never put in a URL. Returns null for "not found" and for "wrong contact" alike,
 *  so the form cannot be used to discover which references exist. */
export async function track(ref: string, contact: string) {
  if (!(await allowIp("track"))) return null;
  return trackRequest(ref, contact);
}
