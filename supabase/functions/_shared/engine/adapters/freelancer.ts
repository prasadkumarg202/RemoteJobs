// Freelancer.com — official developer API (https://developers.freelancer.com)
// GET https://www.freelancer.com/api/projects/0.1/projects/active/ with an OAuth token
// (header "freelancer-oauth-v1"). Ships DISABLED: create an app + token at
// accounts.freelancer.com/settings/develop and confirm the API terms allow showing projects
// on Mana Kosamu before enabling. Candidates always bid on Freelancer.com itself.

import { sleep } from "../http.ts";
import type { RawJob } from "../types.ts";
import { asArray, num, type FetchContext, type FetchResult, type SourceAdapter, SourceValidationError, str } from "./base.ts";

interface FlProject {
  id?: number; title?: string; seo_url?: string; description?: string; preview_description?: string;
  currency?: { code?: string }; budget?: { minimum?: number; maximum?: number }; type?: string;
  time_submitted?: number; time_updated?: number; jobs?: Array<{ name?: string }>; status?: string;
  local?: boolean; location?: { city?: string; country?: { name?: string } };
  hourly_project_info?: { duration_enum?: string; commitment?: { hours?: number; interval?: string } };
  bid_stats?: { bid_count?: number };
}

export interface FreelancerQuery { query?: string; jobs?: number[]; limit?: number; pages?: number }

const DURATION: Record<string, string> = {
  less_than_one_week: "less than 1 week", one_to_four_weeks: "1 to 4 weeks", one_to_three_months: "1 to 3 months",
  three_to_six_months: "3 to 6 months", over_six_months: "6 months or more", unspecified: "",
};

export function mapFreelancerProject(p: FlProject, siteBase = "https://www.freelancer.com"): RawJob | null {
  if (!p.id || !p.title) return null;
  const url = p.seo_url ? `${siteBase}/projects/${p.seo_url.replace(/^\/+/, "")}` : `${siteBase}/projects/${p.id}`;
  const hourly = p.type === "hourly";
  const dur = DURATION[p.hourly_project_info?.duration_enum ?? ""] ?? "";
  const desc = str(p.description) ?? str(p.preview_description) ?? "";
  const extra = [dur && `Project duration: ${dur}.`, hourly && p.hourly_project_info?.commitment?.hours ? `About ${p.hourly_project_info.commitment.hours} hours per ${p.hourly_project_info.commitment.interval ?? "week"}.` : ""].filter(Boolean).join(" ");
  return {
    sourceJobId: String(p.id),
    externalUrl: url,
    applyUrl: url,
    title: p.title,
    companyName: "Freelancer.com client",
    descriptionHtml: `<p>${desc.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>${extra ? `<p>${extra}</p>` : ""}`,
    employmentTypeRaw: "freelance",
    // Freelancer.com projects are open to freelancers worldwide unless flagged as a local job.
    locationRaw: p.local ? [p.location?.city, p.location?.country?.name].filter(Boolean).join(", ") || null : "Worldwide",
    salaryMin: num(p.budget?.minimum),
    salaryMax: num(p.budget?.maximum),
    salaryCurrency: p.currency?.code ?? null,
    salaryPeriodRaw: hourly ? "hourly" : "project",
    tags: asArray<{ name?: string }>(p.jobs).map((j) => j.name ?? "").filter(Boolean),
    postedAt: p.time_submitted ?? p.time_updated ?? null,
    workModeHint: p.local ? "onsite" : "remote",
  };
}

export class FreelancerAdapter implements SourceAdapter {
  readonly slug = "freelancer";
  readonly name = "Freelancer.com";

  async fetchJobs(ctx: FetchContext): Promise<FetchResult> {
    const token = ctx.secrets?.FREELANCER_OAUTH_TOKEN;
    if (!token) throw new SourceValidationError("FREELANCER_OAUTH_TOKEN is not set");
    const api = ctx.source.api_url ?? "https://www.freelancer.com/api/projects/0.1/projects/active/";
    const site = ctx.source.base_url ?? "https://www.freelancer.com";
    const queries = asArray<FreelancerQuery>(ctx.source.config.queries);
    const qs = queries.length ? queries : [{ limit: 50, pages: 2 }];
    const byId = new Map<string, RawJob>();
    let invalid = 0;
    let n = 0;
    for (const q of qs) {
      const limit = Math.min(q.limit ?? 50, 100);
      for (let page = 0; page < Math.min(q.pages ?? 1, 5); page++) {
        const url = new URL(api);
        url.searchParams.set("compact", "true");
        url.searchParams.set("full_description", "true");
        url.searchParams.set("job_details", "true");
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("offset", String(page * limit));
        if (q.query) url.searchParams.set("query", q.query);
        for (const id of q.jobs ?? []) url.searchParams.append("jobs[]", String(id));
        if (n++ > 0) await sleep(ctx.pageDelayMs ?? 2000);
        const { data } = await ctx.http.json<{ status?: string; result?: { projects?: FlProject[] }; message?: string }>(url.toString(), {
          headers: { "freelancer-oauth-v1": token }, retries: 1,
        });
        if (!data || data.status !== "success" || !Array.isArray(data.result?.projects)) {
          throw new SourceValidationError(`Freelancer.com API error: ${data?.message ?? "missing result.projects"}`);
        }
        for (const p of data.result!.projects!) {
          if (p.status && p.status !== "active") continue;
          const m = mapFreelancerProject(p, site);
          if (m) byId.set(m.sourceJobId, m);
          else invalid++;
        }
        if (data.result!.projects!.length < limit) break;
      }
    }
    return { jobs: [...byId.values()], usedFallback: false, notModified: false, warnings: [], invalid };
  }
}
