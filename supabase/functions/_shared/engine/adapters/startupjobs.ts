// Startup Jobs — documented access (verified 2026-10) is an MCP server over
// Streamable HTTP at https://api.startup.jobs/mcp (no REST/RSS documented).
// Free tier: 20 requests/minute, last 14 days of jobs; optional bearer key.
// Tools: search_jobs (keyword, role, country, remote, employment type), get_job, list_roles, list_countries…
//
// Exact argument names are not published, so this adapter reads the tool's
// inputSchema at runtime (tools/list) and maps our filters onto it. The source
// row ships DISABLED until an admin has reviewed Startup Jobs' current terms.

import { sleep } from "../http.ts";
import type { RawJob } from "../types.ts";
import { asArray, num, type FetchContext, type FetchResult, type SourceAdapter, SourceValidationError, str, strList } from "./base.ts";

export interface StartupJobsQuery { keyword?: string; role?: string; country?: string; remote?: boolean; employment_type?: string }

const ARG_SYNONYMS: Record<keyof StartupJobsQuery, string[]> = {
  keyword: ["keyword", "query", "q", "search", "keywords", "term"],
  role: ["role", "roles", "category", "role_slug"],
  country: ["country", "countries", "location", "country_code"],
  remote: ["remote", "remote_only", "is_remote", "remoteOnly"],
  employment_type: ["employment_type", "employmentType", "type", "job_type", "commitment"],
};

export function mapArgs(q: StartupJobsQuery, schemaProps: Record<string, { type?: string | string[] }>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, syns] of Object.entries(ARG_SYNONYMS) as Array<[keyof StartupJobsQuery, string[]]>) {
    const v = q[k];
    if (v === undefined || v === "") continue;
    const key = syns.find((s) => s in schemaProps);
    if (!key) continue;
    const t = schemaProps[key]?.type;
    const isArr = t === "array" || (Array.isArray(t) && t.includes("array"));
    out[key] = isArr ? [v] : v;
  }
  return out;
}

/** Parse a Streamable-HTTP MCP response (plain JSON or SSE "data:" frames). */
export function parseMcpBody(body: string): Record<string, unknown> {
  const t = body.trim();
  if (t.startsWith("{")) return JSON.parse(t);
  const frames = t.split(/\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean);
  for (let i = frames.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(frames[i]);
      if (obj && (obj.result || obj.error)) return obj;
    } catch { /* keep looking */ }
  }
  throw new SourceValidationError("Unreadable MCP response");
}

/** Find the first array of job-like objects in an arbitrary JSON payload. */
export function findJobArray(v: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 5 || !v) return [];
  if (Array.isArray(v)) {
    if (v.length && v.every((x) => x && typeof x === "object" && ("title" in x || "position" in x || "name" in x && "url" in x))) {
      return v as Record<string, unknown>[];
    }
    for (const x of v) { const r = findJobArray(x, depth + 1); if (r.length) return r; }
    return [];
  }
  if (typeof v === "object") {
    for (const k of ["jobs", "results", "data", "items"]) {
      const r = findJobArray((v as Record<string, unknown>)[k], depth + 1);
      if (r.length) return r;
    }
    for (const x of Object.values(v as Record<string, unknown>)) { const r = findJobArray(x, depth + 1); if (r.length) return r; }
  }
  return [];
}

export function mapStartupJob(j: Record<string, unknown>): RawJob | null {
  const company = j.company && typeof j.company === "object" ? (j.company as Record<string, unknown>) : null;
  const url = str(j.url) ?? str(j.job_url) ?? str(j.link) ?? str(j.permalink);
  const title = str(j.title) ?? str(j.position);
  const id = str(j.id) ?? str(j.uuid) ?? str(j.slug) ?? url;
  if (!url || !title || !id) return null;
  const salary = j.salary && typeof j.salary === "object" ? (j.salary as Record<string, unknown>) : {};
  const remote = j.remote === true || j.is_remote === true || /remote/i.test(String(j.location_type ?? j.workplace ?? ""));
  return {
    sourceJobId: id,
    externalUrl: url,
    applyUrl: str(j.apply_url) ?? str(j.application_url) ?? url,
    title,
    companyName: str(company?.name) ?? str(j.company_name) ?? str(j.company),
    companyLogo: str(company?.logo) ?? str(company?.logo_url) ?? str(j.company_logo),
    descriptionHtml: str(j.description_html) ?? str(j.description) ?? str(j.summary),
    employmentTypeRaw: strList(j.employment_type ?? j.employmentType ?? j.commitment),
    locationRaw: strList(j.locations ?? j.location ?? j.countries).join(", ") || null,
    countriesRaw: strList(j.countries ?? j.country_codes),
    tags: strList(j.tags ?? j.skills),
    categoriesRaw: strList(j.role ?? j.roles ?? j.category),
    salaryMin: num(salary.min ?? j.salary_min),
    salaryMax: num(salary.max ?? j.salary_max),
    salaryCurrency: str(salary.currency ?? j.salary_currency),
    salaryPeriodRaw: str(salary.period ?? salary.interval ?? j.salary_period),
    postedAt: str(j.published_at) ?? str(j.posted_at) ?? str(j.created_at) ?? null,
    workModeHint: remote ? "remote" : null,
  };
}

export class StartupJobsAdapter implements SourceAdapter {
  readonly slug = "startupjobs";
  readonly name = "Startup Jobs";
  private id = 0;

  private async rpc(ctx: FetchContext, url: string, method: string, params: unknown, session: { id?: string }): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    const key = ctx.secrets?.STARTUP_JOBS_API_KEY;
    if (key) headers.Authorization = `Bearer ${key}`;
    if (session.id) headers["Mcp-Session-Id"] = session.id;
    const isNotification = method.startsWith("notifications/");
    const payload = isNotification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: ++this.id, method, params };
    const res = await ctx.http.request(url, { method: "POST", headers, body: JSON.stringify(payload), retries: 1 });
    const sid = res.headers.get("mcp-session-id");
    if (sid) session.id = sid;
    if (isNotification || !res.body.trim()) return {};
    const msg = parseMcpBody(res.body);
    if (msg.error) throw new SourceValidationError(`MCP ${method} error: ${JSON.stringify(msg.error).slice(0, 200)}`);
    return (msg.result ?? {}) as Record<string, unknown>;
  }

  async fetchJobs(ctx: FetchContext): Promise<FetchResult> {
    const url = ctx.source.api_url ?? "https://api.startup.jobs/mcp";
    const session: { id?: string } = {};
    const gap = ctx.pageDelayMs ?? 3500; // stay well under 20 req/min
    await this.rpc(ctx, url, "initialize", {
      protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "manakosamu-jobs", version: "1.0.0" },
    }, session);
    await this.rpc(ctx, url, "notifications/initialized", {}, session);
    await sleep(gap);
    const tools = await this.rpc(ctx, url, "tools/list", {}, session);
    const search = asArray<{ name: string; inputSchema?: { properties?: Record<string, { type?: string }> } }>(tools.tools)
      .find((t) => t.name === "search_jobs");
    if (!search) throw new SourceValidationError("Startup Jobs MCP has no search_jobs tool");
    const props = search.inputSchema?.properties ?? {};

    const queries = asArray<StartupJobsQuery>(ctx.source.config.queries);
    const qs = queries.length ? queries : [{ remote: true }];
    const byId = new Map<string, RawJob>();
    const warnings: string[] = [];
    for (const q of qs.slice(0, 10)) {
      await sleep(gap);
      const result = await this.rpc(ctx, url, "tools/call", { name: "search_jobs", arguments: mapArgs(q, props) }, session);
      const content = asArray<{ type: string; text?: string }>(result.content);
      let payload: unknown = result.structuredContent ?? null;
      if (!payload) {
        const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
        try { payload = JSON.parse(text); } catch { warnings.push("search_jobs returned non-JSON text"); continue; }
      }
      for (const j of findJobArray(payload)) {
        const m = mapStartupJob(j);
        if (m) byId.set(m.sourceJobId, m);
      }
    }
    return { jobs: [...byId.values()], usedFallback: false, notModified: false, warnings };
  }
}
