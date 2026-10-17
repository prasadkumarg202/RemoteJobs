// Jooble — job search API https://jooble.org/api/about (free key on request; POST https://jooble.org/api/<key>)
// Jooble collects listings from many sites, including Indian ones, so it is the lawful route to Indian
// part-time / work-from-home / fresher jobs (Naukri, Indeed etc. have no public API and forbid copying).
// The key lives only in the server secret JOOBLE_API_KEY. Results carry a snippet; candidates follow
// Jooble's link to the full ad. Ships DISABLED until a key is set and Jooble's terms are confirmed.
//
// Request body: { keywords, location, page }. Response: { totalCount, jobs: [{ id?, title, location,
// snippet, salary, source, type, link, company, updated }] }.

import { sleep } from "../http.ts";
import type { RawJob } from "../types.ts";
import { asArray, type FetchContext, type FetchResult, type SourceAdapter, SourceValidationError, str } from "./base.ts";
import { sha256Hex } from "../text.ts";

interface JoobleJob { id?: string | number; title?: string; location?: string; snippet?: string; salary?: string; source?: string; type?: string; link?: string; company?: string; updated?: string }
export interface JoobleQuery { keywords?: string; location?: string; pages?: number }

/** Sensible India defaults: work-from-home, part-time and fresher roles plus Hyderabad / Vijayawada / Visakhapatnam. */
export const JOOBLE_DEFAULT_QUERIES: JoobleQuery[] = [
  { keywords: "work from home", location: "India" },
  { keywords: "part time", location: "India" },
  { keywords: "remote", location: "India" },
  { keywords: "fresher", location: "Hyderabad" },
  { keywords: "", location: "Vijayawada" },
  { keywords: "", location: "Visakhapatnam" },
];

const REMOTE_RE = /\bremote\b|work from home|\bwfh\b|work-from-home|home based/i;

export async function mapJoobleJob(j: JoobleJob): Promise<RawJob | null> {
  const link = str(j.link);
  const title = str(j.title);
  if (!link || !title || !/^https:\/\//.test(link)) return null;
  const location = str(j.location);
  const remote = REMOTE_RE.test(`${title} ${location ?? ""} ${j.type ?? ""}`);
  const id = j.id !== undefined && j.id !== null && String(j.id).trim() ? String(j.id) : (await sha256Hex(link)).slice(0, 24);
  const source = str(j.source);
  return {
    sourceJobId: id,
    externalUrl: link,
    applyUrl: link,
    title: title.replace(/<\/?b>/gi, ""),
    companyName: str(j.company),
    descriptionHtml: j.snippet ? `<p>${j.snippet}</p>${source ? `<p>Originally posted on ${source.replace(/[<>]/g, "")}.</p>` : ""}` : null,
    employmentTypeRaw: str(j.type),
    locationRaw: location,
    country: remote ? null : "India",
    salaryText: str(j.salary),
    postedAt: str(j.updated),
    workModeHint: remote ? "remote" : null,
  };
}

export class JoobleAdapter implements SourceAdapter {
  readonly slug = "jooble";
  readonly name = "Jooble";

  async fetchJobs(ctx: FetchContext): Promise<FetchResult> {
    const key = ctx.secrets?.JOOBLE_API_KEY;
    if (!key) throw new SourceValidationError("JOOBLE_API_KEY is not set");
    if (!/^[A-Za-z0-9-]{8,80}$/.test(key)) throw new SourceValidationError("JOOBLE_API_KEY looks invalid");
    const base = (ctx.source.api_url ?? "https://jooble.org/api").replace(/\/$/, "");
    const queries = asArray<JoobleQuery>(ctx.source.config.queries);
    const qs = queries.length ? queries : JOOBLE_DEFAULT_QUERIES;
    const budget = Number(ctx.source.config.max_requests_per_run ?? 12);
    const byId = new Map<string, RawJob>();
    const warnings: string[] = [];
    let invalid = 0, requests = 0, failed = 0;
    for (const q of qs) {
      for (let page = 1; page <= Math.min(q.pages ?? 1, 5) && requests < budget; page++) {
        if (requests > 0) await sleep(ctx.pageDelayMs ?? 1500);
        requests++;
        try {
          const { data } = await ctx.http.json<{ totalCount?: number; jobs?: JoobleJob[] }>(`${base}/${encodeURIComponent(key)}`, {
            method: "POST", retries: 1,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keywords: q.keywords ?? "", location: q.location ?? "India", page: String(page) }),
          });
          if (!data || !Array.isArray(data.jobs)) throw new SourceValidationError("Jooble response missing jobs[]");
          for (const j of data.jobs) {
            const m = await mapJoobleJob(j);
            if (m) byId.set(m.sourceJobId, m);
            else invalid++;
          }
          if (data.jobs.length < 20) break;
        } catch (e) {
          failed++;
          // The key is part of the URL — never echo the URL.
          warnings.push(`"${q.keywords ?? ""}" in ${q.location ?? "India"}: ${(e as Error).message.replace(key, "***")}`);
          break;
        }
      }
    }
    if (failed && !byId.size) throw new Error(warnings.slice(0, 3).join("; "));
    return { jobs: [...byId.values()], usedFallback: false, notModified: false, warnings, invalid, partial: failed > 0 };
  }
}
