// Adzuna — https://developer.adzuna.com  (covers India: country code "in")
// Terms (read 2026-10-14):
//  • Requires app_id + app_key (free registration). Default limits: 25 hits/min, 250/day,
//    1,000/week, 2,500/month (higher limits can be requested for publishing listings).
//  • Commercial organisations may use the API for a 14-day TRIAL only; ongoing commercial use
//    needs Adzuna's WRITTEN CONSENT / licence → ships DISABLED until that is in place.
//  • Each listing must carry an "Adzuna" label (≥116×23 px) linked to the Adzuna site.
//  • The API returns only a description snippet; candidates follow redirect_url to the full ad.

import { sleep } from "../http.ts";
import type { RawJob } from "../types.ts";
import { asArray, num, type FetchContext, type FetchResult, type SourceAdapter, SourceValidationError, str } from "./base.ts";

interface AdzunaJob {
  id?: string | number; title?: string; description?: string; redirect_url?: string; created?: string;
  company?: { display_name?: string }; location?: { display_name?: string; area?: string[] };
  salary_min?: number; salary_max?: number; salary_is_predicted?: string | number;
  contract_type?: string; contract_time?: string; category?: { label?: string; tag?: string };
}

export interface AdzunaQuery { country?: string; what?: string; where?: string; pages?: number; max_days_old?: number }

const CURRENCY: Record<string, string> = { in: "INR", gb: "GBP", us: "USD", ca: "CAD", au: "AUD", sg: "SGD", de: "EUR", fr: "EUR", nl: "EUR" };

export function mapAdzunaJob(j: AdzunaJob, country: string): RawJob | null {
  const url = str(j.redirect_url);
  if (!j.title || !url || j.id === undefined) return null;
  const area = asArray<string>(j.location?.area);
  const display = str(j.location?.display_name);
  const remote = /\bremote|work from home|wfh\b/i.test(`${j.title} ${display ?? ""}`);
  // Predicted salaries are Adzuna estimates, not the employer's figure → never show them as the salary.
  const predicted = String(j.salary_is_predicted ?? "0") === "1";
  const ct = [j.contract_time, j.contract_type].filter(Boolean).join(" ").replace(/_/g, " ");
  return {
    sourceJobId: String(j.id),
    externalUrl: url,
    applyUrl: url,
    title: j.title.replace(/<\/?strong>/g, ""),
    companyName: j.company?.display_name ?? null,
    descriptionHtml: j.description ? `<p>${j.description}</p>` : null,
    employmentTypeRaw: ct || null,
    locationRaw: display ?? null,
    city: area.length >= 3 ? area[area.length - 1] : null,
    state: area.length >= 2 ? area[1] : null,
    country: area[0] ?? (country === "in" ? "India" : null),
    salaryMin: predicted ? null : num(j.salary_min),
    salaryMax: predicted ? null : num(j.salary_max),
    salaryCurrency: CURRENCY[country] ?? null,
    salaryPeriodRaw: predicted ? null : "yearly",
    categoriesRaw: j.category?.label ? [j.category.label] : [],
    postedAt: j.created ?? null,
    workModeHint: remote ? "remote" : null,
  };
}

export class AdzunaAdapter implements SourceAdapter {
  readonly slug = "adzuna";
  readonly name = "Adzuna";

  async fetchJobs(ctx: FetchContext): Promise<FetchResult> {
    const appId = ctx.secrets?.ADZUNA_APP_ID;
    const appKey = ctx.secrets?.ADZUNA_APP_KEY;
    if (!appId || !appKey) throw new SourceValidationError("ADZUNA_APP_ID / ADZUNA_APP_KEY are not set");
    const base = (ctx.source.api_url ?? "https://api.adzuna.com/v1/api/jobs").replace(/\/$/, "");
    const queries = asArray<AdzunaQuery>(ctx.source.config.queries);
    const qs = queries.length ? queries : [{ country: "in", pages: 2 }];
    const byId = new Map<string, RawJob>();
    let invalid = 0;
    let requests = 0;
    const budget = Number(ctx.source.config.max_requests_per_run ?? 10); // stays well inside 250/day
    for (const q of qs) {
      const country = (q.country ?? "in").toLowerCase();
      for (let page = 1; page <= Math.min(q.pages ?? 1, 10) && requests < budget; page++) {
        const url = new URL(`${base}/${country}/search/${page}`);
        url.searchParams.set("app_id", appId);
        url.searchParams.set("app_key", appKey);
        url.searchParams.set("results_per_page", "50");
        url.searchParams.set("sort_by", "date");
        url.searchParams.set("max_days_old", String(q.max_days_old ?? 7));
        if (q.what) url.searchParams.set("what", q.what);
        if (q.where) url.searchParams.set("where", q.where);
        if (requests > 0) await sleep(ctx.pageDelayMs ?? 3000); // ≤ 25 hits/min
        requests++;
        const { data } = await ctx.http.json<{ results?: AdzunaJob[] }>(url.toString(), { retries: 1 });
        if (!data || !Array.isArray(data.results)) throw new SourceValidationError("Adzuna response missing results[]");
        for (const j of data.results) {
          const m = mapAdzunaJob(j, country);
          if (m) byId.set(m.sourceJobId, m);
          else invalid++;
        }
        if (data.results.length < 50) break;
      }
    }
    return { jobs: [...byId.values()], usedFallback: false, notModified: false, warnings: [], invalid };
  }
}
