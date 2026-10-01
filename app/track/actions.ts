"use server";
import { trackRequest } from "@/lib/repo";

/** Looks a request up for someone who is not signed in. Runs on the server so the reference and
 *  phone number are never put in a URL. Returns null for "not found" and for "wrong number" alike,
 *  so the form cannot be used to discover which references exist. */
export async function track(ref: string, phone: string) {
  return trackRequest(ref, phone);
}
