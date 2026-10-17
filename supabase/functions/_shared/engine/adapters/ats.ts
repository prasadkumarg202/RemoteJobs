// Direct employer feeds from applicant-tracking systems, for companies an admin chooses:
//   Greenhouse Job Board API  https://developers.greenhouse.io/job-board.html  (public GET, no auth)
//   Lever Postings API        https://github.com/lever/postings-api           (public GET, no auth)
//   Ashby Job Posting API     https://developers.ashbyhq.com/docs/public-job-posting-api (public GET, no auth)
// Neither is a global search API: each company has its own board token / site name, stored in
// job_sources.config.boards = [{ "token": "acme", "company": "Acme", "eu": false }].
// Each board returns ALL of that company's open jobs, so jobs that vanish are closed (full feed),
// unless any board failed this run (partial).

import { INDIAN_CITIES } from "../geo.ts";
import { findDistrict } from "../districts.ts";
import { decodeEntities } from "../text.ts";
import { sleep } from "../http.ts";
import type { RawJob, WorkMode } from "../types.ts";
import { asArray, type FetchContext, type FetchResult, num, type SourceAdapter, SourceValidationError, str } from "./base.ts";

export interface AtsBoard { token: string; company: string; eu?: boolean }

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/** Reads and validates config.boards (bad entries are reported, not fetched). */
export function readBoards(config: Record<string, unknown>): { boards: AtsBoard[]; warnings: string[] } {
  const boards: AtsBoard[] = [];
  const warnings: string[] = [];
  for (const b of asArray<Record<string, unknown>>(config.boards)) {
    const token = str(b?.token);
    if (!token || !TOKEN.test(token)) { warnings.push(`Skipped invalid board token ${JSON.stringify(b?.token ?? null)}`); continue; }
    boards.push({ token, company: str(b.company) ?? token, eu: b.eu === true });
  }
  return { boards, warnings };
}

/** Parse a 'token | Company | eu' textarea (admin form) into boards. */
export function parseBoardLines(text: string): { boards: AtsBoard[]; errors: string[] } {
  const boards: AtsBoard[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const [token, company, flag] = t.split("|").map((x) => x.trim());
    if (!TOKEN.test(token ?? "")) { errors.push(`Line ${i + 1}: "${token}" is not a valid board token`); continue; }
    if (seen.has(token.toLowerCase())) continue;
    seen.add(token.toLowerCase());
    boards.push({ token, company: (company || token).slice(0, 120), eu: /^eu$/i.test(flag ?? "") });
  }
  if (boards.length > 200) errors.push("At most 200 boards per source");
  return { boards: boards.slice(0, 200), errors };
}

const CITY_RE = new RegExp(`(?<![a-z])(${Object.keys(INDIAN_CITIES).join("|")})(?![a-z])`, "i");
/** Default filter: keep jobs in India or remote; Mana Kosamu users can't take on-site jobs abroad. */
export function relevantLocation(text: string): boolean {
  return /remote|anywhere|worldwide|work from home|\bwfh\b|india|apac|asia/i.test(text) || CITY_RE.test(text) || !!findDistrict(text);
}

export function workModeFrom(...parts: Array<string | null | undefined>): WorkMode {
  const t = parts.filter(Boolean).join(" ").toLowerCase();
  if (/hybrid/.test(t)) return "hybrid";
  if (/remote|anywhere|work from home/.test(t)) return "remote";
  return "onsite";
}

// ---------------- Greenhouse ----------------

interface GhJob {
  id?: number; title?: string; absolute_url?: string; updated_at?: string; first_published?: string; company_name?: string;
  location?: { name?: string }; content?: string; departments?: Array<{ name?: string }>; offices?: Array<{ name?: string; location?: string }>;
}

export function mapGreenhouseJob(j: GhJob, board: AtsBoard): RawJob | null {
  const url = str(j.absolute_url);
  if (!j.id || !j.title || !url) return null;
  const loc = str(j.location?.name) ?? asArray<{ name?: string }>(j.offices).map((o) => o.name).filter(Boolean).join(", ") ?? null;
  return {
    sourceJobId: `${board.token}:${j.id}`,
    externalUrl: url,
    applyUrl: url,
    title: j.title.trim(),
    companyName: str(j.company_name) ?? board.company,
    // The list endpoint returns HTML-escaped HTML.
    descriptionHtml: j.content ? decodeEntities(j.content) : null,
    locationRaw: loc || null,
    tags: asArray<{ name?: string }>(j.departments).map((d) => str(d.name)).filter((x): x is string => !!x),
    postedAt: j.first_published ?? j.updated_at ?? null,
    workModeHint: workModeFrom(loc, j.title),
  };
}

// ---------------- Lever ----------------

interface LeverPosting {
  id?: string; text?: string; hostedUrl?: string; applyUrl?: string; createdAt?: number; country?: string;
  categories?: { location?: string; commitment?: string; team?: string; department?: string; allLocations?: string[] };
  description?: string; lists?: Array<{ text?: string; content?: string }>; additional?: string; workplaceType?: string;
  salaryRange?: { currency?: string; interval?: string; min?: number; max?: number };
}

const INTERVAL: Array<[RegExp, string]> = [[/year|annual/i, "yearly"], [/month/i, "monthly"], [/week/i, "weekly"], [/day|daily/i, "daily"], [/hour/i, "hourly"]];

export function mapLeverPosting(p: LeverPosting, board: AtsBoard): RawJob | null {
  const url = str(p.hostedUrl);
  if (!p.id || !p.text || !url) return null;
  const c = p.categories ?? {};
  const locs = [c.location, ...(c.allLocations ?? [])].filter((x): x is string => !!x);
  const location = [...new Set(locs)].join(", ") || null;
  const wp = (p.workplaceType ?? "").toLowerCase();
  const mode: WorkMode = wp === "remote" ? "remote" : wp === "hybrid" ? "hybrid" : wp === "on-site" || wp === "onsite" ? "onsite" : workModeFrom(location, p.text);
  const lists = asArray<{ text?: string; content?: string }>(p.lists).map((l) => `<h3>${l.text ?? ""}</h3><ul>${l.content ?? ""}</ul>`).join("");
  const sr = p.salaryRange;
  const country = str(p.country);
  return {
    sourceJobId: `${board.token}:${p.id}`,
    externalUrl: url,
    applyUrl: str(p.applyUrl) ?? url,
    title: p.text.trim(),
    companyName: board.company,
    descriptionHtml: [p.description ?? "", lists, p.additional ?? ""].join("") || null,
    employmentTypeRaw: c.commitment ?? null,
    locationRaw: location,
    // For remote roles Lever's country is where the role is open; on-site roles carry their city instead.
    countriesRaw: mode === "remote" && country ? [country] : null,
    country: mode !== "remote" ? country : null,
    salaryMin: num(sr?.min), salaryMax: num(sr?.max), salaryCurrency: str(sr?.currency),
    salaryPeriodRaw: sr?.interval ? INTERVAL.find(([re]) => re.test(sr.interval!))?.[1] ?? null : null,
    tags: [c.team, c.department].filter((x): x is string => !!x),
    postedAt: p.createdAt ?? null,
    workModeHint: mode,
  };
}

// ---------------- Ashby ----------------
// Public Job Posting API https://developers.ashbyhq.com/docs/public-job-posting-api (GET, no auth).
// Postings with isListed:false are direct-link-only and must not be listed → skipped.

interface AshbyAddress { addressLocality?: string; addressRegion?: string; addressCountry?: string }
interface AshbyComp { compensationType?: string; interval?: string; currencyCode?: string | null; minValue?: number | null; maxValue?: number | null }
interface AshbyJob {
  id?: string; title?: string; location?: string; secondaryLocations?: Array<{ location?: string; address?: AshbyAddress }>;
  department?: string; team?: string; isListed?: boolean; isRemote?: boolean; workplaceType?: string;
  descriptionHtml?: string; publishedAt?: string; employmentType?: string;
  address?: { postalAddress?: AshbyAddress }; jobUrl?: string; applyUrl?: string;
  compensation?: { summaryComponents?: AshbyComp[] };
}

const ASHBY_TYPES: Record<string, string> = { FullTime: "full-time", PartTime: "part-time", Intern: "internship", Contract: "contract", Temporary: "temporary" };

export function mapAshbyJob(j: AshbyJob, board: AtsBoard): RawJob | null {
  const url = str(j.jobUrl);
  if (!j.title || !url || !/^https:\/\//.test(url)) return null;
  const id = str(j.id) ?? url.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!id) return null;
  const locs = [j.location, ...asArray<{ location?: string }>(j.secondaryLocations).map((s) => s.location)].filter((x): x is string => !!x);
  const location = [...new Set(locs)].join(", ") || null;
  const wp = (j.workplaceType ?? "").toLowerCase();
  const mode: WorkMode = wp === "remote" || (j.isRemote && wp !== "hybrid") ? "remote" : wp === "hybrid" ? "hybrid" : wp === "onsite" ? "onsite" : workModeFrom(location, j.title);
  const addr = j.address?.postalAddress ?? {};
  const salary = asArray<AshbyComp>(j.compensation?.summaryComponents).find((c) => /salary/i.test(c.compensationType ?? "") && (c.minValue || c.maxValue));
  return {
    sourceJobId: `${board.token}:${id}`,
    externalUrl: url,
    applyUrl: str(j.applyUrl) ?? url,
    title: j.title.trim(),
    companyName: board.company,
    descriptionHtml: str(j.descriptionHtml),
    employmentTypeRaw: j.employmentType ? ASHBY_TYPES[j.employmentType] ?? j.employmentType : null,
    locationRaw: location,
    city: mode !== "remote" ? str(addr.addressLocality) : null,
    state: mode !== "remote" ? str(addr.addressRegion) : null,
    country: mode !== "remote" ? str(addr.addressCountry) : null,
    salaryMin: num(salary?.minValue), salaryMax: num(salary?.maxValue), salaryCurrency: str(salary?.currencyCode),
    salaryPeriodRaw: salary?.interval ? INTERVAL.find(([re]) => re.test(salary.interval!))?.[1] ?? null : null,
    tags: [j.department, j.team].filter((x): x is string => !!x),
    postedAt: j.publishedAt ?? null,
    workModeHint: mode,
  };
}

// ---------------- Adapters ----------------

abstract class AtsAdapter implements SourceAdapter {
  abstract readonly slug: string;
  abstract readonly name: string;
  protected abstract fetchBoard(ctx: FetchContext, board: AtsBoard): Promise<{ jobs: RawJob[]; invalid: number }>;

  async fetchJobs(ctx: FetchContext): Promise<FetchResult> {
    const { boards, warnings } = readBoards(ctx.source.config);
    if (!boards.length) return { jobs: [], usedFallback: false, notModified: false, partial: true, warnings: [...warnings, `No company boards configured — add them in /admin/jobs (${this.name}).`] };
    const filterAll = ctx.source.config.location_filter === "all";
    const jobs: RawJob[] = [];
    let invalid = 0, filtered = 0, failed = 0;
    for (const [i, board] of boards.entries()) {
      if (i > 0) await sleep(ctx.pageDelayMs ?? 1000);
      try {
        const r = await this.fetchBoard(ctx, board);
        invalid += r.invalid;
        for (const j of r.jobs) {
          if (!filterAll && !relevantLocation(`${j.locationRaw ?? ""} ${j.title}`)) { filtered++; continue; }
          jobs.push(j);
        }
      } catch (e) {
        failed++;
        warnings.push(`${board.company} (${board.token}): ${(e as Error).message}`);
      }
    }
    if (failed === boards.length) throw new Error(`All ${boards.length} ${this.name} boards failed: ${warnings.slice(-3).join("; ")}`);
    if (filtered) warnings.push(`${filtered} jobs outside India / not remote were skipped (config.location_filter = "india_or_remote")`);
    // Missing jobs are closed only when every board answered.
    return { jobs, usedFallback: false, notModified: false, warnings, invalid, partial: failed > 0 };
  }
}

export class GreenhouseAdapter extends AtsAdapter {
  readonly slug = "greenhouse";
  readonly name = "Greenhouse";
  protected async fetchBoard(ctx: FetchContext, board: AtsBoard) {
    const base = (ctx.source.api_url ?? "https://boards-api.greenhouse.io/v1/boards").replace(/\/$/, "");
    const { data } = await ctx.http.json<{ jobs?: GhJob[] }>(`${base}/${encodeURIComponent(board.token)}/jobs?content=true`, { retries: 1 });
    if (!data || !Array.isArray(data.jobs)) throw new SourceValidationError("response missing jobs[]");
    let invalid = 0;
    const jobs: RawJob[] = [];
    for (const j of data.jobs) { const m = mapGreenhouseJob(j, board); if (m) jobs.push(m); else invalid++; }
    return { jobs, invalid };
  }
}

export class AshbyAdapter extends AtsAdapter {
  readonly slug = "ashby";
  readonly name = "Ashby";
  protected async fetchBoard(ctx: FetchContext, board: AtsBoard) {
    const base = (ctx.source.api_url ?? "https://api.ashbyhq.com/posting-api/job-board").replace(/\/$/, "");
    const { data } = await ctx.http.json<{ jobs?: AshbyJob[] }>(`${base}/${encodeURIComponent(board.token)}?includeCompensation=true`, { retries: 1 });
    if (!data || !Array.isArray(data.jobs)) throw new SourceValidationError("response missing jobs[]");
    let invalid = 0;
    const jobs: RawJob[] = [];
    for (const j of data.jobs) {
      if (j.isListed === false) continue; // direct-link-only posting
      const m = mapAshbyJob(j, board);
      if (m) jobs.push(m); else invalid++;
    }
    return { jobs, invalid };
  }
}

export class LeverAdapter extends AtsAdapter {
  readonly slug = "lever";
  readonly name = "Lever";
  protected async fetchBoard(ctx: FetchContext, board: AtsBoard) {
    const base = board.eu ? "https://api.eu.lever.co/v0/postings" : (ctx.source.api_url ?? "https://api.lever.co/v0/postings").replace(/\/$/, "");
    const limit = 100;
    const maxPages = Number(ctx.source.config.max_pages_per_board ?? 5);
    const jobs: RawJob[] = [];
    let invalid = 0;
    for (let page = 0; page < maxPages; page++) {
      if (page > 0) await sleep(ctx.pageDelayMs ?? 1000);
      const { data } = await ctx.http.json<LeverPosting[]>(`${base}/${encodeURIComponent(board.token)}?mode=json&limit=${limit}&skip=${page * limit}`, { retries: 1 });
      if (!Array.isArray(data)) throw new SourceValidationError("response is not an array");
      for (const p of data) { const m = mapLeverPosting(p, board); if (m) jobs.push(m); else invalid++; }
      if (data.length < limit) break;
    }
    return { jobs, invalid };
  }
}
