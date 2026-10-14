// Remotive — https://github.com/remotive-com/remote-jobs-api
// Terms (verified 2026-10-14): GET https://remotive.com/api/remote-jobs, no auth;
// fetch only a few times a day (~4/day max; >2 req/min is blocked); jobs are delayed 24h;
// must link back to the Remotive job URL and name Remotive as the source;
// must NOT submit Remotive jobs to third-party boards/aggregators (Google Jobs, LinkedIn, Jooble…)
// → never emit JobPosting JSON-LD for them; must not use listings to collect signups/emails.

import type { RawJob } from "../types.ts";
import { type FetchContext, type FetchResult, type SourceAdapter, SourceValidationError, str, strList } from "./base.ts";

interface RemotiveJob {
  id?: number | string; url?: string; title?: string; company_name?: string; company_logo?: string; company_logo_url?: string;
  category?: string; tags?: string[]; job_type?: string; publication_date?: string; candidate_required_location?: string;
  salary?: string; description?: string;
}

export function mapRemotiveJob(j: RemotiveJob): RawJob | null {
  const url = str(j.url);
  if (!j.title || !url || j.id === undefined) return null;
  const loc = str(j.candidate_required_location);
  return {
    sourceJobId: String(j.id),
    externalUrl: url,
    applyUrl: url, // candidates apply via Remotive's page
    title: j.title,
    companyName: j.company_name ?? null,
    companyLogo: str(j.company_logo) ?? str(j.company_logo_url),
    descriptionHtml: j.description ?? null,
    employmentTypeRaw: j.job_type ? j.job_type.replace(/_/g, " ") : null,
    locationRaw: loc && !/^remote$/i.test(loc) ? loc : null,
    tags: strList(j.tags),
    categoriesRaw: j.category ? [j.category] : [],
    salaryText: str(j.salary),
    postedAt: j.publication_date ?? null,
    workModeHint: "remote",
  };
}

export class RemotiveAdapter implements SourceAdapter {
  readonly slug = "remotive";
  readonly name = "Remotive";

  async fetchJobs(ctx: FetchContext): Promise<FetchResult> {
    const url = new URL(ctx.source.api_url ?? "https://remotive.com/api/remote-jobs");
    // One request per run returns all active jobs (Remotive asks for ~4 requests/day max).
    const category = str(ctx.source.config.category);
    if (category) url.searchParams.set("category", category);
    const { data } = await ctx.http.json<{ jobs?: RemotiveJob[] }>(url.toString(), { retries: 1 });
    if (!data || typeof data !== "object" || !Array.isArray(data.jobs)) throw new SourceValidationError("Remotive response missing jobs[]");
    const jobs: RawJob[] = [];
    let invalid = 0;
    for (const j of data.jobs) {
      const m = mapRemotiveJob(j);
      if (m) jobs.push(m);
      else invalid++;
    }
    return { jobs, usedFallback: false, notModified: false, warnings: [], invalid };
  }
}
