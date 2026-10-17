// Careerjet (https://www.careerjet.co.in) — "Search more jobs" on the search page.
// Careerjet's publisher API only allows live searches made by a real visitor (each call carries the
// visitor's IP and browser), so results are fetched per page view and never stored. Publishers are paid
// per click on the result links. Without a key we only show a button that opens Careerjet's own search.
// Pure helpers (no server imports) so they can be unit-tested.

import { DISTRICT_BY_SLUG } from "@engine/districts.ts";

export const CAREERJET_API = "https://search.api.careerjet.net/v4/query";
export const CAREERJET_SITE = "https://www.careerjet.co.in";
export const CAREERJET_LOCALE = "en_IN";

export interface CareerjetJob {
  url: string;
  title: string;
  company: string | null;
  locations: string | null;
  date: string | null;
  salary: string | null;
  description: string | null;
}

/** Where to search: city → district head town → state → India. */
export function careerjetPlace(f: { city?: string; district?: string; state?: string }): string {
  if (f.city?.trim()) return f.city.trim();
  if (f.district && DISTRICT_BY_SLUG[f.district]) return DISTRICT_BY_SLUG[f.district].hq;
  if (f.state && f.state !== "all") return f.state;
  return "India";
}

/** Link that opens Careerjet's own search for the visitor's words. */
export function careerjetSiteUrl(q: string, place = "India"): string {
  const u = new URL("/search/jobs", CAREERJET_SITE);
  u.searchParams.set("s", q.trim().slice(0, 100));
  u.searchParams.set("l", place.trim().slice(0, 80) || "India");
  return u.toString();
}

export function careerjetQueryUrl(o: { q: string; place: string; ip: string; ua: string; pageSize?: number; base?: string }): string {
  const u = new URL(o.base ?? CAREERJET_API);
  u.searchParams.set("locale_code", CAREERJET_LOCALE);
  u.searchParams.set("keywords", o.q.trim().slice(0, 100));
  u.searchParams.set("location", o.place.trim().slice(0, 80) || "India");
  u.searchParams.set("user_ip", o.ip);
  u.searchParams.set("user_agent", o.ua.slice(0, 400));
  u.searchParams.set("page_size", String(Math.min(Math.max(o.pageSize ?? 8, 1), 20)));
  u.searchParams.set("sort", "date");
  u.searchParams.set("fragment_size", "180");
  return u.toString();
}

/** Basic auth: the key is the user name, the password is empty. */
export function careerjetAuthHeader(key: string): string {
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

/** First public IP from x-forwarded-for / x-real-ip (Careerjet rejects calls without one). */
export function visitorIp(forwardedFor: string | null, realIp: string | null): string | null {
  const first = (forwardedFor ?? "").split(",")[0]?.trim() || realIp?.trim() || "";
  return /^[0-9a-f:.]{3,45}$/i.test(first) ? first : null;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/** Keeps only well-formed jobs with https links (Careerjet's are tracking links, e.g. jobviewtrack.com). */
export function parseCareerjet(body: unknown): { jobs: CareerjetJob[]; hits: number } {
  const b = body as { type?: string; hits?: number; jobs?: unknown[] } | null;
  if (!b || (b.type && b.type !== "JOBS") || !Array.isArray(b.jobs)) return { jobs: [], hits: 0 };
  const jobs: CareerjetJob[] = [];
  for (const raw of b.jobs) {
    const j = raw as Record<string, unknown>;
    const url = typeof j.url === "string" ? j.url : "";
    const title = text(j.title, 160);
    if (!title || !/^https:\/\/[^\s/]+\.[^\s/]+\//.test(url)) continue;
    jobs.push({
      url,
      title,
      company: text(j.company, 120),
      locations: text(j.locations, 120),
      date: text(j.date, 40),
      salary: text(j.salary, 80),
      description: text(j.description, 220),
    });
  }
  return { jobs, hits: typeof b.hits === "number" ? b.hits : jobs.length };
}
