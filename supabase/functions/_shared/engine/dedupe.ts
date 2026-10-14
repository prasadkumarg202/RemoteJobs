// Cross-source duplicate detection. Order of evidence:
//  1. same source + source_job_id   (handled by the mapping lookup in the pipeline)
//  2. canonical apply URL
//  3. content_hash (normalized title | company | location)
//  4. same normalized company + similar title + similar content, compatible salary & dates

import { jaccard, shingles, tokenSet } from "./text.ts";
import type { ExistingJobRef, NormalizedJob } from "./types.ts";

export type DuplicateReason = "canonical_url" | "content_hash" | "similar_content";

const GENERIC_URL = /^https:\/\/[^/]+\/?$|\/(?:careers|jobs|apply)\/?$/i;
const UNKNOWN_COMPANY = new Set(["", "company not disclosed", "confidential", "stealth", "stealth startup"]);

function salaryCompatible(a: Pick<ExistingJobRef, "salary_min" | "salary_max" | "salary_currency">, b: Pick<NormalizedJob, "salary_min" | "salary_max" | "salary_currency">): boolean {
  const av = a.salary_max ?? a.salary_min;
  const bv = b.salary_max ?? b.salary_min;
  if (av === null || bv === null || !a.salary_currency || !b.salary_currency) return true;
  if (a.salary_currency !== b.salary_currency) return true; // can't compare reliably
  return Math.abs(av - bv) / Math.max(av, bv) <= 0.25;
}

function withinDays(a: string, b: string, days: number): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= days * 86400000;
}

export function findDuplicate(job: NormalizedJob, candidates: ExistingJobRef[]): { match: ExistingJobRef; reason: DuplicateReason } | null {
  if (job.canonical_url && !GENERIC_URL.test(job.canonical_url)) {
    const m = candidates.find((c) => c.canonical_url === job.canonical_url);
    if (m) return { match: m, reason: "canonical_url" };
  }
  const companyKnown = !UNKNOWN_COMPANY.has(job.normalized_company);
  if (companyKnown) {
    const m = candidates.find((c) => c.content_hash === job.content_hash && salaryCompatible(c, job) && withinDays(c.posted_at, job.posted_at, 60));
    if (m) return { match: m, reason: "content_hash" };

    const titleTokens = tokenSet(job.normalized_title);
    const descSh = shingles(job.short_description);
    for (const c of candidates) {
      if (c.normalized_company !== job.normalized_company) continue;
      if (!withinDays(c.posted_at, job.posted_at, 45) || !salaryCompatible(c, job)) continue;
      const titleSim = jaccard(titleTokens, tokenSet(c.normalized_title));
      if (titleSim < 0.75) continue;
      const descSim = jaccard(descSh, shingles(c.short_description));
      if (titleSim === 1 || descSim >= 0.3) return { match: c, reason: "similar_content" };
    }
  }
  return null;
}

/** Fields the canonical record may borrow from a duplicate if it lacks them. */
export function enrichmentPatch(existing: ExistingJobRef, dup: NormalizedJob): Partial<NormalizedJob> {
  const patch: Partial<NormalizedJob> = {};
  if (!existing.company_logo && dup.company_logo) patch.company_logo = dup.company_logo;
  if (existing.salary_min === null && existing.salary_max === null && (dup.salary_min !== null || dup.salary_max !== null)) {
    Object.assign(patch, {
      salary_min: dup.salary_min, salary_max: dup.salary_max, salary_currency: dup.salary_currency, salary_period: dup.salary_period,
      salary_inr_min: dup.salary_inr_min, salary_inr_max: dup.salary_inr_max, salary_inr_annual_max: dup.salary_inr_annual_max,
    });
  }
  return patch;
}
