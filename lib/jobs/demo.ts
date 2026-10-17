// Demo mode: in-memory search over data/demo-jobs.json (built by scripts/build-demo-data.ts
// from the test fixtures through the real ingestion pipeline). Mirrors public.search_jobs.

import demo from "@/data/demo-jobs.json";
import type { JobCard, JobDetail, JobFilters, SearchResult } from "./types";

const JOBS = demo.jobs as unknown as JobDetail[];
const GENERATED_AT = new Date(demo.generated_at).getTime();
// Shift dates so the demo always looks fresh, keeping relative ages.
const SHIFT = Date.now() - GENERATED_AT;
const shift = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + SHIFT).toISOString() : iso);
const LIVE: JobDetail[] = JOBS.map((j) => ({ ...j, posted_at: shift(j.posted_at)!, expires_at: shift(j.expires_at) }));

const INDIA: Record<string, string[]> = {
  india_only: ["explicit"],
  india_apac: ["explicit", "region", "timezone"],
  worldwide: ["worldwide"],
  eligible: ["explicit", "worldwide", "region", "timezone"],
};

function textScore(j: JobDetail, q: string): number {
  const terms = q.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  if (!terms.length) return 1;
  const title = j.title.toLowerCase();
  const head = `${title} ${j.company_name} ${j.skills.join(" ")} ${j.keywords.join(" ")} ${j.category ?? ""} ${j.subcategory ?? ""}`.toLowerCase();
  const body = j.description.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const stem = term.replace(/(ing|ers?|s)$/, "");
    if (title.includes(term) || title.includes(stem)) score += 3;
    else if (head.includes(term) || head.includes(stem)) score += 2;
    else if (body.includes(term)) score += 1;
    else return 0; // every term must match somewhere
  }
  return score;
}

const anyIn = (a: string[] | undefined, b: string[]) => !a?.length || a.some((x) => b.includes(x));

export function demoSearch(f: JobFilters): SearchResult {
  const now = Date.now();
  const scored: Array<{ j: JobDetail; s: number }> = [];
  for (const j of LIVE) {
    if (j.expires_at && new Date(j.expires_at).getTime() < now) continue;
    if (f.sections?.length && !f.sections.every((s) => j.sections.includes(s))) continue;
    if (f.india && f.india !== "any" && !INDIA[f.india]?.includes(j.india_eligibility)) continue;
    if (f.country && !(j.country === f.country || j.eligible_countries.includes(f.country))) continue;
    if (f.regions?.length && !(f.regions.some((r) => j.eligible_regions.includes(r)) || (f.regions.includes("worldwide") && j.remote_worldwide))) continue;
    if (f.categories?.length && !f.categories.some((c) => c === j.category || c === j.subcategory || j.keywords.includes(c))) continue;
    if (f.aiCategories?.length && !f.aiCategories.some((c) => c === j.ai_category || j.keywords.includes(c))) continue;
    if (f.aiMin && j.ai_score < f.aiMin) continue;
    if (!anyIn(f.types, [j.employment_type])) continue;
    if (!anyIn(f.modes, [j.work_mode])) continue;
    if (!anyIn(f.seniority, [j.seniority])) continue;
    if (f.budgetTypes?.length && !f.budgetTypes.includes(j.budget_type ?? "")) continue;
    if (!anyIn(f.durations, [j.job_duration])) continue;
    if (f.salaryMinInr && !((j as unknown as { salary_inr_annual_max: number | null }).salary_inr_annual_max! >= f.salaryMinInr)) continue;
    if (f.postedWithin && now - new Date(j.posted_at).getTime() > f.postedWithin * 86400000) continue;
    if (f.sources?.length && !j.sources.some((s) => f.sources!.includes(s.slug))) continue;
    if (f.city && j.city?.toLowerCase() !== f.city.toLowerCase()) continue;
    if (f.district && j.district !== f.district) continue;
    if (f.state && !(f.state === "all_india" ? !j.state && j.country === "IN" : j.state === f.state)) continue;
    if (f.excludeIds?.includes(j.id)) continue;
    const s = f.q ? textScore(j, f.q) : 1;
    if (s > 0) scored.push({ j, s });
  }
  const sort = f.sort ?? (f.q ? "relevance" : "newest");
  scored.sort((a, b) => {
    if (sort === "salary") {
      const d = ((b.j as unknown as { salary_inr_annual_max: number }).salary_inr_annual_max ?? -1) - ((a.j as unknown as { salary_inr_annual_max: number }).salary_inr_annual_max ?? -1);
      if (d) return d;
    }
    if (sort === "relevance" && b.s !== a.s) return b.s - a.s;
    return new Date(b.j.posted_at).getTime() - new Date(a.j.posted_at).getTime();
  });
  const limit = f.limit ?? 20;
  const offset = ((f.page ?? 1) - 1) * limit;
  return { total: scored.length, items: scored.slice(offset, offset + limit).map((x) => x.j as JobCard) };
}

export function demoGetBySlug(slug: string): JobDetail | null {
  return LIVE.find((j) => j.slug === slug) ?? null;
}

export function demoGetByIds(ids: string[]): JobCard[] {
  return LIVE.filter((j) => ids.includes(j.id));
}

export function demoSectionCounts(): Record<string, number> {
  const c: Record<string, number> = { all: LIVE.length, remote: 0, ai: 0, freelance: 0, wfh: 0, local: 0, government: 0, india: 0 };
  for (const j of LIVE) {
    for (const s of j.sections) c[s] = (c[s] ?? 0) + 1;
    if (j.work_mode === "remote" && INDIA.eligible.includes(j.india_eligibility)) c.india++;
  }
  return c;
}

export const DEMO_JOBS = LIVE;
