// Jobicy — https://github.com/Jobicy/remote-jobs-api
// Terms (verified 2026-10): no auth; poll at most once per hour (a few times a
// day is enough); keep Jobicy as the source and preserve the canonical job URL;
// sanitize jobDescription HTML; taxonomy slugs must come from ?get=industries /
// ?get=locations (never hard-coded).

import { sleep } from "../http.ts";
import { all, first, parseFeed } from "../rss.ts";
import { decodeEntities } from "../text.ts";
import type { RawJob } from "../types.ts";
import { asArray, num, type FetchContext, type FetchResult, type SourceAdapter, SourceValidationError, str, strList, withRssFallback } from "./base.ts";

interface JobicyJob {
  id?: number | string; url?: string; jobSlug?: string; jobTitle?: string; companyName?: string; companyLogo?: string;
  jobIndustry?: string[] | string; jobType?: string[] | string; jobGeo?: string; jobLevel?: string; jobExcerpt?: string;
  jobDescription?: string; pubDate?: string; salaryMin?: number | string; salaryMax?: number | string;
  salaryCurrency?: string; salaryPeriod?: string;
}

export interface JobicyQuery { geo?: string; industry?: string; tag?: string; count?: number }
interface Taxonomy { industries: string[]; locations: string[]; fetched_at: string }

const TAXONOMY_TTL_MS = 7 * 24 * 3600 * 1000;

export function mapJobicyJob(j: JobicyJob): RawJob | null {
  const url = str(j.url);
  if (!j.jobTitle || !url || j.id === undefined) return null;
  return {
    sourceJobId: String(j.id),
    externalUrl: url,
    applyUrl: url,
    title: decodeEntities(j.jobTitle),
    companyName: j.companyName ? decodeEntities(j.companyName) : null,
    companyLogo: j.companyLogo ?? null,
    descriptionHtml: j.jobDescription ?? null,
    excerpt: j.jobExcerpt ?? null,
    employmentTypeRaw: strList(j.jobType),
    locationRaw: j.jobGeo ?? null,
    categoriesRaw: strList(j.jobIndustry).map((s) => decodeEntities(s)),
    seniorityRaw: j.jobLevel && j.jobLevel !== "Any" ? j.jobLevel : null,
    salaryMin: num(j.salaryMin),
    salaryMax: num(j.salaryMax),
    salaryCurrency: j.salaryCurrency ?? null,
    salaryPeriodRaw: j.salaryPeriod ?? null,
    postedAt: j.pubDate ?? null,
    workModeHint: "remote",
  };
}

/** Extract slug lists from the taxonomy endpoint regardless of exact wrapper keys. */
export function extractSlugs(data: unknown, kind: "industry" | "geo"): string[] {
  const out = new Set<string>();
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === "string" && k.toLowerCase() === `${kind}slug`) out.add(val);
        else if (typeof val === "object") visit(val);
      }
    }
  };
  visit(data);
  return [...out];
}

export class JobicyAdapter implements SourceAdapter {
  readonly slug = "jobicy";
  readonly name = "Jobicy";

  private async taxonomy(ctx: FetchContext, api: string): Promise<{ tax: Taxonomy | null; refreshed: boolean; warning?: string }> {
    const cached = ctx.source.config.taxonomy as Taxonomy | undefined;
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TAXONOMY_TTL_MS) return { tax: cached, refreshed: false };
    try {
      const [ind, loc] = [await ctx.http.json(`${api}?get=industries`), await ctx.http.json(`${api}?get=locations`)];
      const tax: Taxonomy = {
        industries: extractSlugs(ind.data, "industry"),
        locations: extractSlugs(loc.data, "geo"),
        fetched_at: ctx.now.toISOString(),
      };
      if (!tax.industries.length && !tax.locations.length) return { tax: cached ?? null, refreshed: false, warning: "Jobicy taxonomy empty" };
      return { tax, refreshed: true };
    } catch (e) {
      return { tax: cached ?? null, refreshed: false, warning: `Jobicy taxonomy unavailable: ${(e as Error).message}` };
    }
  }

  async fetchJobs(ctx: FetchContext): Promise<FetchResult> {
    const { source } = ctx;
    const api = source.api_url ?? "https://jobicy.com/api/v2/remote-jobs";
    const queries = asArray<JobicyQuery>(source.config.queries);
    const qs: JobicyQuery[] = queries.length ? queries : [{}];
    const warnings: string[] = [];
    let configPatch: Record<string, unknown> | undefined;

    const primary = async (): Promise<FetchResult> => {
      const needsTaxonomy = qs.some((q) => q.geo || q.industry);
      let tax: Taxonomy | null = null;
      if (needsTaxonomy) {
        const t = await this.taxonomy(ctx, api);
        tax = t.tax;
        if (t.warning) warnings.push(t.warning);
        if (t.refreshed && t.tax) configPatch = { taxonomy: t.tax };
      }
      const byId = new Map<string, RawJob>();
      const invalidKeys = new Set<string>();
      for (const [i, q] of qs.entries()) {
        const url = new URL(api);
        url.searchParams.set("count", String(Math.min(200, Math.max(1, q.count ?? 100))));
        if (q.geo) {
          if (tax && !tax.locations.includes(q.geo)) { warnings.push(`Unknown Jobicy geo "${q.geo}" skipped`); continue; }
          url.searchParams.set("geo", q.geo);
        }
        if (q.industry) {
          if (tax && !tax.industries.includes(q.industry)) { warnings.push(`Unknown Jobicy industry "${q.industry}" skipped`); continue; }
          url.searchParams.set("industry", q.industry);
        }
        if (q.tag) url.searchParams.set("tag", q.tag.slice(0, 50));
        const { data } = await ctx.http.json<{ jobs?: JobicyJob[]; jobCount?: number }>(url.toString());
        if (!data || typeof data !== "object") throw new SourceValidationError("Jobicy response is not an object");
        // An empty jobs array (or jobCount: 0) is a valid "no results" answer; anything else without jobs[] is not.
        if (!Array.isArray(data.jobs) && data.jobCount !== 0) throw new SourceValidationError("Jobicy response missing jobs[]");
        for (const j of data.jobs ?? []) {
          const m = mapJobicyJob(j);
          if (m) byId.set(m.sourceJobId, m);
          else invalidKeys.add(String(j.id ?? j.jobTitle ?? JSON.stringify(j).slice(0, 80)));
        }
        if (i < qs.length - 1) await sleep(ctx.pageDelayMs ?? 2000);
      }
      return { jobs: [...byId.values()], usedFallback: false, notModified: false, warnings, configPatch, invalid: invalidKeys.size };
    };

    const fallback = source.rss_url
      ? async (): Promise<FetchResult> => {
          const res = await ctx.http.request(source.rss_url!);
          const jobs: RawJob[] = [];
          for (const { f, attrs } of parseFeed(res.body)) {
            const link = first(f.link);
            if (!link || !first(f.title)) continue;
            jobs.push({
              sourceJobId: first(f["job_listing:id"]) || first(f.guid).match(/[?&]p=(\d+)/)?.[1] || first(f.guid) || link,
              externalUrl: link,
              applyUrl: link,
              title: first(f.title),
              companyName: first(f["job_listing:company"]) || null,
              companyLogo: attrs["media:content"]?.url ?? null,
              descriptionHtml: first(f["content:encoded"]) || first(f.description),
              locationRaw: first(f["job_listing:location"]) || null,
              employmentTypeRaw: first(f["job_listing:job_type"]) || null,
              categoriesRaw: all(f.category),
              postedAt: first(f.pubdate) || null,
              workModeHint: "remote",
            });
          }
          return { jobs, usedFallback: true, notModified: false, warnings: [] };
        }
      : null;

    return withRssFallback(primary, fallback);
  }
}
