// URL search params ⇄ JobFilters, plus natural-language query intent parsing
// ("python remote india", "n8n freelancer", "data entry work from home").

import type { IndiaMode, JobFilters, JobSection, SortMode } from "./types";

type Params = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const int = (v: string | string[] | undefined) => {
  const n = Number(one(v));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
};

const INDIA_MODES: IndiaMode[] = ["india_only", "india_apac", "worldwide", "eligible", "any"];
const SORTS: SortMode[] = ["relevance", "newest", "salary"];

export function filtersFromParams(p: Params): JobFilters {
  const india = one(p.india) as IndiaMode | undefined;
  const sort = one(p.sort) as SortMode | undefined;
  const salaryLakh = Number(one(p.salary));
  return {
    q: one(p.q)?.slice(0, 120),
    india: india && INDIA_MODES.includes(india) ? india : undefined,
    country: one(p.country)?.toUpperCase().slice(0, 2),
    regions: list(p.region),
    categories: list(p.cat),
    aiCategories: list(p.ai),
    types: list(p.type),
    modes: list(p.mode),
    seniority: list(p.level),
    salaryMinInr: Number.isFinite(salaryLakh) && salaryLakh > 0 ? salaryLakh * 100000 : undefined,
    budgetTypes: list(p.budget),
    durations: list(p.dur),
    postedWithin: int(p.posted),
    sources: list(p.source),
    city: one(p.city),
    sort: sort && SORTS.includes(sort) ? sort : undefined,
    page: int(p.page) ?? 1,
  };
}

/** Keys the filter UI owns, so "clear all" can drop them while keeping the page context. */
export const FILTER_KEYS = ["india", "country", "region", "cat", "ai", "type", "mode", "level", "salary", "budget", "dur", "posted", "source", "city", "sort"];

export function countActiveFilters(p: Params): number {
  return FILTER_KEYS.filter((k) => k !== "sort" && one(p[k])).length;
}

export interface QueryIntent {
  text: string;
  sections: JobSection[];
  india?: IndiaMode;
  types: string[];
}

const STOP = /\b(jobs?|vacanc(?:y|ies)|openings?|hiring|positions?|roles?|careers?|work|online|for|in|the|a|an|with|near me|latest|new)\b/gi;

export function parseQueryIntent(raw: string | undefined): QueryIntent {
  const intent: QueryIntent = { text: "", sections: [], types: [] };
  if (!raw) return intent;
  let q = ` ${raw.toLowerCase()} `;
  const take = (re: RegExp, fn: () => void) => {
    if (re.test(q)) { fn(); q = q.replace(re, " "); }
  };
  take(/\b(work from home|work-from-home|wfh|from home|home based)\b/g, () => intent.sections.push("wfh"));
  take(/\b(remote(?:ly)?|anywhere)\b/g, () => intent.sections.push("remote"));
  take(/\b(freelanc(?:e|er|ers|ing)|gigs?|side hustle|projects? based)\b/g, () => intent.sections.push("freelance"));
  take(/\b(government|govt|sarkari)\b/g, () => intent.sections.push("government"));
  take(/\b(part[- ]?time)\b/g, () => intent.types.push("part_time"));
  take(/\b(internships?|interns?)\b/g, () => intent.types.push("internship"));
  if (/\bindia(?:n)?\b/.test(q)) {
    q = q.replace(/\bindia(?:n)?\b/g, " ");
    intent.india = "eligible";
    if (!intent.sections.includes("remote") && !intent.sections.includes("wfh")) intent.sections.push("remote");
  }
  q = q.replace(STOP, " ").replace(/\s+/g, " ").trim();
  // A bare "ai" is a section, not a keyword ("AI jobs remote"); "AI automation" stays as text.
  if (/^(ai|a\.i\.|artificial intelligence)$/.test(q)) { intent.sections.push("ai"); q = ""; }
  intent.text = q;
  return intent;
}

/** Merge parsed intent into explicit filters (explicit URL filters win). */
export function applyIntent(f: JobFilters, intent: QueryIntent): JobFilters {
  const sections = [...new Set([...(f.sections ?? []), ...intent.sections])];
  return {
    ...f,
    q: intent.text || undefined,
    sections: sections.length ? sections : undefined,
    india: f.india ?? intent.india,
    types: f.types?.length ? f.types : intent.types.length ? intent.types : undefined,
  };
}

export function paramsToQueryString(p: Params, patch: Record<string, string | null | undefined> = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    const val = one(v);
    if (val && !(k in patch)) sp.set(k, val);
  }
  for (const [k, v] of Object.entries(patch)) if (v) sp.set(k, v);
  if (!("page" in patch)) sp.delete("page");
  const s = sp.toString();
  return s ? `?${s}` : "";
}
