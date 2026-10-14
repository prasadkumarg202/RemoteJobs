// Working Nomads — public JSON feed https://www.workingnomads.com/api/exposed_jobs/
// No published terms were found (checked 2026-10-14) → ships DISABLED until an admin confirms
// with Working Nomads that showing their jobs (with attribution + link back) is allowed.

import type { RawJob } from "../types.ts";
import { type FetchContext, type FetchResult, type SourceAdapter, SourceValidationError, str, strList } from "./base.ts";

interface WnJob { url?: string; title?: string; description?: string; company_name?: string; category_name?: string; tags?: string; location?: string; pub_date?: string }

export function mapWorkingNomadsJob(j: WnJob): RawJob | null {
  const url = str(j.url);
  if (!j.title || !url) return null;
  const id = url.match(/\/(\d+)\/?(?:\?|$)/)?.[1] ?? url;
  const loc = str(j.location);
  const tz = loc?.match(/time ?zone:?\s*([A-Z]{2,4}|UTC[+-−]?\d{0,2})/i)?.[1];
  return {
    sourceJobId: id,
    externalUrl: url,
    applyUrl: url,
    title: j.title,
    companyName: j.company_name ?? null,
    descriptionHtml: j.description ?? null,
    locationRaw: loc && !tz ? loc : null,
    timezonesRaw: tz ? [tz] : null,
    tags: strList(j.tags),
    categoriesRaw: j.category_name ? [j.category_name] : [],
    postedAt: j.pub_date ?? null,
    workModeHint: "remote",
  };
}

export class WorkingNomadsAdapter implements SourceAdapter {
  readonly slug = "workingnomads";
  readonly name = "Working Nomads";

  async fetchJobs(ctx: FetchContext): Promise<FetchResult> {
    const { data } = await ctx.http.json<WnJob[]>(ctx.source.api_url ?? "https://www.workingnomads.com/api/exposed_jobs/", { retries: 1 });
    if (!Array.isArray(data)) throw new SourceValidationError("Working Nomads response is not an array");
    const jobs: RawJob[] = [];
    let invalid = 0;
    for (const j of data) {
      const m = mapWorkingNomadsJob(j);
      if (m) jobs.push(m);
      else invalid++;
    }
    return { jobs, usedFallback: false, notModified: false, warnings: [], invalid };
  }
}
