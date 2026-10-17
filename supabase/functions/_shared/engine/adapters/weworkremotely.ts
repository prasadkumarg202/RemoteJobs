// We Work Remotely — public RSS feeds https://weworkremotely.com/remote-job-rss-feed
// Terms (read 2026-10-16): the RSS page says "Anyone can use the feed, all we ask is that you attribute the
// links back to We Work Remotely", but the API terms (weworkremotely.com/api-terms-and-guidelines) forbid
// "a job advertising or job search service", storing their data and applying outside weworkremotely.com,
// and don't say whether RSS is covered → ships DISABLED until WWR confirms in writing.
// Every job links to (and is applied on) its weworkremotely.com page, with "Source: We Work Remotely".
// Item tags: title ("Company: Job title"), region, country, state, skills, category, type, description
// (escaped HTML), pubDate, expires_at, guid, link, media:content (logo).
// The all-jobs feed is not guaranteed to list every open job, so missing jobs are not closed (full_feed off);
// each job carries its own expires_at instead.

import { all, first, parseFeed } from "../rss.ts";
import { sleep } from "../http.ts";
import type { RawJob } from "../types.ts";
import { asArray, type FetchContext, type FetchResult, type SourceAdapter, SourceValidationError, str, strList } from "./base.ts";
import type { FeedItem } from "../rss.ts";

const DEFAULT_FEED = "https://weworkremotely.com/remote-jobs.rss";

/** "Acme Inc: Senior Engineer" → ["Acme Inc", "Senior Engineer"]. */
export function splitWwrTitle(t: string): { company: string | null; title: string } {
  const m = t.trim().match(/^(.{1,120}?):\s+(.+)$/);
  return m ? { company: m[1].trim(), title: m[2].trim() } : { company: null, title: t.trim() };
}

export function mapWwrItem(item: FeedItem): RawJob | null {
  const f = item.f;
  const link = str(first(f.link)) ?? str(first(f.guid));
  const rawTitle = str(first(f.title));
  if (!link || !rawTitle || !/^https:\/\/([a-z0-9-]+\.)*weworkremotely\.com\//i.test(link)) return null;
  const { company, title } = splitWwrTitle(rawTitle);
  const id = link.replace(/[?#].*$/, "").replace(/\/$/, "").split("/").pop();
  if (!id) return null;
  const region = str(first(f.region));
  const country = str(first(f.country));
  // region is where the job may be done ("Anywhere in the World", "USA Only", "Europe Only"…);
  // state is usually the company's head office, so it is not used as a restriction.
  const location = [region, country].filter(Boolean).join(", ") || null;
  const logo = str(item.attrs["media:content"]?.url);
  return {
    sourceJobId: id,
    externalUrl: link,
    applyUrl: link,
    title,
    companyName: company,
    companyLogo: logo && /^https:\/\//.test(logo) ? logo : null,
    descriptionHtml: str(first(f.description)),
    employmentTypeRaw: str(first(f.type)),
    locationRaw: location,
    tags: strList(first(f.skills)),
    categoriesRaw: all(f.category).filter(Boolean),
    postedAt: str(first(f.pubdate)),
    expiresAt: str(first(f.expires_at)),
    workModeHint: "remote",
  };
}

export class WeWorkRemotelyAdapter implements SourceAdapter {
  readonly slug = "weworkremotely";
  readonly name = "We Work Remotely";

  async fetchJobs(ctx: FetchContext): Promise<FetchResult> {
    // config.feeds: optional list of category feed URLs; default = the all-jobs feed.
    const feeds = asArray<string>(ctx.source.config.feeds).filter((u) => typeof u === "string" && /^https:\/\/weworkremotely\.com\/.+\.rss$/.test(u));
    const urls = feeds.length ? feeds.slice(0, 12) : [ctx.source.rss_url ?? DEFAULT_FEED];
    const byId = new Map<string, RawJob>();
    const warnings: string[] = [];
    let invalid = 0, failed = 0;
    for (const [i, url] of urls.entries()) {
      if (i > 0) await sleep(ctx.pageDelayMs ?? 1000);
      try {
        const res = await ctx.http.request(url, { retries: 1, headers: { Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.5" } });
        let items: FeedItem[];
        try { items = parseFeed(res.body); } catch { throw new SourceValidationError("We Work Remotely feed is not RSS"); }
        for (const it of items) {
          const m = mapWwrItem(it);
          if (m) byId.set(m.sourceJobId, m);
          else invalid++;
        }
      } catch (e) {
        failed++;
        warnings.push(`${url}: ${(e as Error).message}`);
      }
    }
    if (failed === urls.length) throw new Error(warnings.join("; "));
    return { jobs: [...byId.values()], usedFallback: false, notModified: false, warnings, invalid, partial: failed > 0 };
  }
}
