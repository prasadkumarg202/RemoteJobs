// Remote OK — https://remoteok.com/api  (RSS: https://remoteok.com/remote-jobs.rss)
// Terms (verified 2026-10): free, no auth; aggregators must credit Remote OK and
// link back to each original job URL. The first array element is a legal notice.

import { all, first, parseFeed } from "../rss.ts";
import type { RawJob } from "../types.ts";
import { num, type FetchContext, type FetchResult, type SourceAdapter, SourceValidationError, str, strList, withRssFallback } from "./base.ts";

interface RemoteOkJob {
  id?: string | number; slug?: string; epoch?: number; date?: string; company?: string; company_logo?: string; logo?: string;
  position?: string; tags?: string[]; description?: string; location?: string; salary_min?: number; salary_max?: number;
  apply_url?: string; url?: string; legal?: string;
}

export function mapRemoteOkJob(j: RemoteOkJob): RawJob | null {
  const url = str(j.url) ?? (j.slug ? `https://remoteok.com/remote-jobs/${j.slug}` : null);
  if (!j.position || !url || j.id === undefined) return null;
  const salaryMin = num(j.salary_min);
  const salaryMax = num(j.salary_max);
  const loc = str(j.location);
  return {
    sourceJobId: String(j.id),
    externalUrl: url,
    applyUrl: str(j.apply_url) ?? url,
    title: j.position,
    companyName: j.company ?? null,
    companyLogo: str(j.company_logo) ?? str(j.logo),
    descriptionHtml: j.description ?? null,
    tags: strList(j.tags),
    locationRaw: loc && !/^remote$/i.test(loc) ? loc : null,
    salaryMin,
    salaryMax,
    salaryCurrency: salaryMin || salaryMax ? "USD" : null,
    salaryPeriodRaw: salaryMin || salaryMax ? "yearly" : null,
    postedAt: j.epoch ?? j.date ?? null,
    workModeHint: "remote",
  };
}

export class RemoteOkAdapter implements SourceAdapter {
  readonly slug = "remoteok";
  readonly name = "Remote OK";

  async fetchJobs(ctx: FetchContext): Promise<FetchResult> {
    const { source } = ctx;
    const primary = async (): Promise<FetchResult> => {
      const url = new URL(source.api_url ?? "https://remoteok.com/api");
      const tags = strList(source.config.tags);
      if (tags.length) url.searchParams.set("tags", tags.join(","));
      const cache = source.http_cache ?? {};
      const { data, res } = await ctx.http.json<RemoteOkJob[]>(url.toString(), {
        etag: (cache.etag as string) ?? null,
        lastModified: (cache.last_modified as string) ?? null,
      });
      const httpCache = { etag: res.headers.get("etag"), last_modified: res.headers.get("last-modified") };
      if (res.notModified) return { jobs: [], usedFallback: false, notModified: true, warnings: [], httpCache: cache };
      if (!Array.isArray(data)) throw new SourceValidationError("Remote OK response is not an array");
      const jobs: RawJob[] = [];
      let invalid = 0;
      for (const j of data) {
        if (j && typeof j === "object" && "legal" in j) continue; // legal notice row
        const m = mapRemoteOkJob(j);
        if (m) jobs.push(m);
        else invalid++;
      }
      return { jobs, usedFallback: false, notModified: false, warnings: [], httpCache, invalid };
    };

    const fallback = source.rss_url
      ? async (): Promise<FetchResult> => {
          const res = await ctx.http.request(source.rss_url!);
          const jobs: RawJob[] = [];
          for (const { f, attrs } of parseFeed(res.body)) {
            const link = first(f.link) || first(f.guid);
            if (!link || !first(f.title)) continue;
            const id = first(f.guid).match(/(\d{5,})/)?.[1] ?? link;
            jobs.push({
              sourceJobId: id,
              externalUrl: link,
              applyUrl: link,
              title: first(f.title).replace(/\s+at\s+[^@]+$/, ""),
              companyName: first(f.company) || null,
              companyLogo: first(f.image) || attrs["media:content"]?.url || null,
              descriptionHtml: first(f.description),
              tags: first(f.tags) ? first(f.tags).split(",").map((s) => s.trim()) : all(f.category),
              locationRaw: first(f.location) || null,
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
