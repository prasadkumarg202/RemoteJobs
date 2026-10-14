// Himalayas — https://himalayas.app/api
// Terms (verified 2026-10): no auth; browse endpoint max limit=20 with cursor
// pagination; data refreshes daily → sync once a day; link back to the Himalayas
// job URL and name Himalayas as the source; do NOT submit Himalayas jobs to
// third-party job sites (incl. Google Jobs) → we never emit JobPosting JSON-LD for them.

import { sleep } from "../http.ts";
import { all, first, parseFeed } from "../rss.ts";
import { isHttpUrl } from "../text.ts";
import type { RawJob } from "../types.ts";
import { asArray, num, type FetchContext, type FetchResult, type SourceAdapter, SourceValidationError, str, strList, withRssFallback } from "./base.ts";

interface HimalayasJob {
  title?: string; excerpt?: string; companyName?: string; companySlug?: string; companyLogo?: string;
  employmentType?: string; minSalary?: number | null; maxSalary?: number | null; salaryPeriod?: string; currency?: string;
  seniority?: string | string[]; locationRestrictions?: unknown[]; timezoneRestriction?: Array<number | string>;
  timezoneRestrictions?: Array<number | string>; category?: string[]; categories?: string[]; parentCategories?: string[];
  description?: string; pubDate?: number | string; expiryDate?: number | string; applicationLink?: string; guid?: string;
}

export function mapHimalayasJob(j: HimalayasJob): RawJob | null {
  const guid = str(j.guid);
  const apply = str(j.applicationLink);
  const listing = isHttpUrl(guid) ? guid! : apply;
  if (!j.title || !listing) return null;
  const countries = strList(j.locationRestrictions);
  const tz = asArray<number | string>(j.timezoneRestriction ?? j.timezoneRestrictions);
  return {
    sourceJobId: guid ?? apply!,
    externalUrl: listing,
    applyUrl: apply ?? listing,
    title: j.title,
    companyName: j.companyName ?? null,
    companyLogo: j.companyLogo ?? null,
    descriptionHtml: j.description ?? null,
    excerpt: j.excerpt ?? null,
    employmentTypeRaw: j.employmentType ?? null,
    countriesRaw: countries,
    // Himalayas: no locationRestrictions and no timezone restriction = open worldwide.
    locationRaw: countries.length === 0 && tz.length === 0 ? "Worldwide" : null,
    timezonesRaw: tz,
    salaryMin: num(j.minSalary),
    salaryMax: num(j.maxSalary),
    salaryCurrency: j.currency ?? null,
    salaryPeriodRaw: j.salaryPeriod ?? (num(j.minSalary) ? "annual" : null),
    categoriesRaw: [...strList(j.category ?? j.categories), ...strList(j.parentCategories)],
    seniorityRaw: Array.isArray(j.seniority) ? j.seniority.join(" ") : j.seniority ?? null,
    postedAt: j.pubDate ?? null,
    expiresAt: j.expiryDate ?? null,
    workModeHint: "remote",
  };
}

export class HimalayasAdapter implements SourceAdapter {
  readonly slug = "himalayas";
  readonly name = "Himalayas";

  async fetchJobs(ctx: FetchContext): Promise<FetchResult> {
    const { source } = ctx;
    const primary = async (): Promise<FetchResult> => {
      const api = source.api_url ?? "https://himalayas.app/jobs/api";
      const maxPages = Number(source.config.max_pages ?? 10);
      const jobs: RawJob[] = [];
      const warnings: string[] = [];
      let invalid = 0;
      let cursor: string | null = null;
      for (let page = 0; page < maxPages; page++) {
        const url = new URL(api);
        url.searchParams.set("limit", "20");
        if (cursor) url.searchParams.set("cursor", cursor);
        const { data } = await ctx.http.json<{ jobs?: HimalayasJob[]; nextCursor?: string | null }>(url.toString());
        if (!data || typeof data !== "object" || !Array.isArray(data.jobs)) {
          throw new SourceValidationError("Himalayas response missing jobs[]");
        }
        for (const j of data.jobs) {
          const m = mapHimalayasJob(j);
          if (m) jobs.push(m);
          else invalid++;
        }
        cursor = data.nextCursor ?? null;
        if (!cursor || data.jobs.length === 0) break;
        await sleep(ctx.pageDelayMs ?? 1500);
      }
      return { jobs, usedFallback: false, notModified: false, warnings, invalid };
    };

    const fallback = source.rss_url
      ? async (): Promise<FetchResult> => {
          const res = await ctx.http.request(source.rss_url!);
          const items = parseFeed(res.body);
          const jobs: RawJob[] = [];
          for (const { f, attrs } of items) {
            const link = first(f.link) || first(f.guid);
            const title = first(f.title);
            if (!link || !title) continue;
            const company = first(f["himalayasjobs:companyname"]) || first(f["dc:creator"]) || (title.match(/\bat\s+(.+)$/)?.[1] ?? "");
            jobs.push({
              sourceJobId: first(f.guid) || link,
              externalUrl: link,
              applyUrl: link,
              title: title.replace(/\s+at\s+[^,]+$/, ""),
              companyName: company || null,
              companyLogo: attrs["media:content"]?.url ?? attrs["enclosure"]?.url ?? first(f["himalayasjobs:companylogo"]) ?? null,
              descriptionHtml: first(f["content:encoded"]) || first(f.description),
              categoriesRaw: all(f.category),
              countriesRaw: all(f["himalayasjobs:locationrestriction"]),
              employmentTypeRaw: first(f["himalayasjobs:employmenttype"]) || null,
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
