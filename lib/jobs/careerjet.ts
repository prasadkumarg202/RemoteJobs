import "server-only";
import { headers } from "next/headers";
import { careerjetAuthHeader, careerjetQueryUrl, parseCareerjet, visitorIp, type CareerjetJob } from "./careerjet-core";

/** "off" hides the Careerjet box entirely. */
export const careerjetEnabled = () => process.env.CAREERJET !== "off";

/**
 * Live Careerjet search for the current visitor (needs CAREERJET_API_KEY). Returns null when there is no
 * key, the visitor's IP is unknown, or Careerjet is slow/failing — the page then shows only the link.
 * Never cached or stored: Careerjet allows only live searches made by a real visitor.
 */
export async function searchCareerjet(q: string, place: string): Promise<{ jobs: CareerjetJob[]; hits: number } | null> {
  const key = process.env.CAREERJET_API_KEY;
  if (!key || !q.trim()) return null;
  const h = await headers();
  const ip = visitorIp(h.get("x-forwarded-for"), h.get("x-real-ip"));
  const ua = h.get("user-agent");
  if (!ip || !ua) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(careerjetQueryUrl({ q, place, ip, ua, base: process.env.CAREERJET_API_URL || undefined }), {
      headers: { Authorization: careerjetAuthHeader(key), Accept: "application/json", ...(h.get("referer") ? { Referer: h.get("referer")! } : {}) },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`careerjet: HTTP ${res.status}`);
      return null;
    }
    return parseCareerjet(await res.json());
  } catch (e) {
    console.warn(`careerjet: ${(e as Error).name === "AbortError" ? "timed out" : (e as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
