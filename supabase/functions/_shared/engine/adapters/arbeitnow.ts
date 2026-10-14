// Arbeitnow — free job board API https://www.arbeitnow.com/api/job-board-api (no key).
// Jobs are mostly Europe-based (many remote). Detailed terms are only in their Postman docs,
// which could not be read on 2026-10-14 → ships DISABLED until an admin reviews them.

import { sleep } from "../http.ts";
import type { RawJob } from "../types.ts";
import { type FetchContext, type FetchResult, type SourceAdapter, SourceValidationError, str, strList } from "./base.ts";

interface AnJob { slug?: string; company_name?: string; title?: string; description?: string; remote?: boolean; url?: string; tags?: string[]; job_types?: string[]; location?: string; created_at?: number }

export function mapArbeitnowJob(j: AnJob): RawJob | null {
  const url = str(j.url);
  if (!j.title || !url || !j.slug) return null;
  return {
    sourceJobId: j.slug,
    externalUrl: url,
    applyUrl: url,
    title: j.title,
    companyName: j.company_name ?? null,
    descriptionHtml: j.description ?? null,
    employmentTypeRaw: strList(j.job_types),
    // Arbeitnow "remote" usually still means within the employer's country; keep the location as the restriction.
    locationRaw: str(j.location),
    tags: strList(j.tags),
    postedAt: j.created_at ?? null,
    workModeHint: j.remote ? "remote" : "onsite",
  };
}

export class ArbeitnowAdapter implements SourceAdapter {
  readonly slug = "arbeitnow";
  readonly name = "Arbeitnow";

  async fetchJobs(ctx: FetchContext): Promise<FetchResult> {
    const base = ctx.source.api_url ?? "https://www.arbeitnow.com/api/job-board-api";
    const maxPages = Number(ctx.source.config.max_pages ?? 3);
    const remoteOnly = ctx.source.config.remote_only !== false;
    const jobs: RawJob[] = [];
    let invalid = 0;
    for (let page = 1; page <= maxPages; page++) {
      const url = new URL(base);
      url.searchParams.set("page", String(page));
      if (page > 1) await sleep(ctx.pageDelayMs ?? 1500);
      const { data } = await ctx.http.json<{ data?: AnJob[]; links?: { next?: string | null } }>(url.toString(), { retries: 1 });
      if (!data || !Array.isArray(data.data)) throw new SourceValidationError("Arbeitnow response missing data[]");
      for (const j of data.data) {
        if (remoteOnly && !j.remote) continue;
        const m = mapArbeitnowJob(j);
        if (m) jobs.push(m);
        else invalid++;
      }
      if (!data.links?.next || data.data.length === 0) break;
    }
    return { jobs, usedFallback: false, notModified: false, warnings: [], invalid };
  }
}
