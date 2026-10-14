// Persistence port used by the sync pipeline, with a Supabase implementation
// (Edge Functions / scripts) and an in-memory one (tests, demo data).

import type { ExchangeRates, ExistingJobRef, NormalizedJob, SourceConfig, SyncResult } from "./types.ts";

export type StoredJob = NormalizedJob & { payload_hash: string };

export interface MappingRow {
  job_id: string;
  source_id: string;
  external_job_id: string;
  external_url: string;
  is_primary: boolean;
  last_seen_at: string;
}

export interface OwnedRef {
  id: string;
  payload_hash: string | null;
  moderation_status: string;
  is_active: boolean;
}

export interface JobRepository {
  getSource(slug: string): Promise<SourceConfig | null>;
  getExchangeRates(): Promise<ExchangeRates>;
  startLog(sourceId: string, startedAt: string): Promise<string>;
  finishLog(logId: string, result: SyncResult, status: "success" | "partial" | "failed" | "skipped"): Promise<void>;
  updateSource(sourceId: string, patch: Record<string, unknown>): Promise<void>;
  findOwned(sourceId: string, sourceJobIds: string[]): Promise<Map<string, OwnedRef>>;
  findMapped(sourceId: string, sourceJobIds: string[]): Promise<Map<string, string>>;
  findCandidates(q: { canonicalUrls: string[]; contentHashes: string[]; companies: string[] }): Promise<ExistingJobRef[]>;
  insertJobs(jobs: StoredJob[]): Promise<Map<string, string>>; // source_job_id -> id
  updateJob(id: string, patch: Partial<StoredJob>): Promise<void>;
  upsertMappings(rows: MappingRow[]): Promise<void>;
  deactivateMissing(sourceId: string, seenSourceJobIds: string[]): Promise<number>;
}

const REF_COLUMNS =
  "id,source_id,canonical_url,content_hash,normalized_title,normalized_company,short_description,salary_min,salary_max,salary_currency,posted_at,company_logo,is_active";

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// deno-lint-ignore no-explicit-any
type AnyClient = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export class SupabaseJobRepository implements JobRepository {
  constructor(private db: AnyClient) {}

  async getSource(slug: string): Promise<SourceConfig | null> {
    const res = await this.db.from("job_sources").select("*").eq("slug", slug).maybeSingle();
    return check(res, "getSource") as SourceConfig | null;
  }

  async getExchangeRates(): Promise<ExchangeRates> {
    const rows = check(await this.db.from("exchange_rates").select("currency,inr_per_unit"), "getExchangeRates") as Array<{ currency: string; inr_per_unit: number }>;
    const out: ExchangeRates = { INR: 1 };
    for (const r of rows ?? []) out[r.currency] = Number(r.inr_per_unit);
    return out;
  }

  async startLog(sourceId: string, startedAt: string): Promise<string> {
    const row = check(await this.db.from("job_sync_logs").insert({ source_id: sourceId, started_at: startedAt, status: "running" }).select("id").single(), "startLog") as { id: string };
    return row.id;
  }

  async finishLog(logId: string, r: SyncResult, status: string): Promise<void> {
    check(await this.db.from("job_sync_logs").update({
      completed_at: r.completed_at, status, jobs_found: r.jobs_found, jobs_added: r.jobs_added, jobs_updated: r.jobs_updated,
      jobs_skipped: r.jobs_skipped, jobs_duplicates: r.jobs_duplicates, jobs_expired: r.jobs_expired, jobs_flagged: r.jobs_flagged,
      used_fallback: r.used_fallback, errors: r.errors,
    }).eq("id", logId), "finishLog");
  }

  async updateSource(sourceId: string, patch: Record<string, unknown>): Promise<void> {
    check(await this.db.from("job_sources").update(patch).eq("id", sourceId), "updateSource");
  }

  async findOwned(sourceId: string, ids: string[]): Promise<Map<string, OwnedRef>> {
    const out = new Map<string, OwnedRef>();
    for (const part of chunk(ids, 150)) {
      const rows = check(await this.db.from("jobs").select("id,source_job_id,payload_hash,moderation_status,is_active").eq("source_id", sourceId).in("source_job_id", part), "findOwned") as Array<OwnedRef & { source_job_id: string }>;
      for (const r of rows ?? []) out.set(r.source_job_id, r);
    }
    return out;
  }

  async findMapped(sourceId: string, ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const part of chunk(ids, 150)) {
      const rows = check(await this.db.from("job_sources_mapping").select("job_id,external_job_id").eq("source_id", sourceId).in("external_job_id", part), "findMapped") as Array<{ job_id: string; external_job_id: string }>;
      for (const r of rows ?? []) out.set(r.external_job_id, r.job_id);
    }
    return out;
  }

  async findCandidates(q: { canonicalUrls: string[]; contentHashes: string[]; companies: string[] }): Promise<ExistingJobRef[]> {
    const byId = new Map<string, ExistingJobRef>();
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const run = async (col: string, vals: string[]) => {
      for (const part of chunk([...new Set(vals.filter(Boolean))], 100)) {
        const rows = check(await this.db.from("jobs").select(REF_COLUMNS).in(col, part).gte("posted_at", since).limit(1000), `findCandidates(${col})`) as ExistingJobRef[];
        for (const r of rows ?? []) byId.set(r.id, r);
      }
    };
    await run("canonical_url", q.canonicalUrls);
    await run("content_hash", q.contentHashes);
    await run("normalized_company", q.companies);
    return [...byId.values()];
  }

  async insertJobs(jobs: StoredJob[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const part of chunk(jobs, 50)) {
      const rows = check(await this.db.from("jobs").insert(part).select("id,source_job_id"), "insertJobs") as Array<{ id: string; source_job_id: string }>;
      for (const r of rows ?? []) out.set(r.source_job_id, r.id);
    }
    return out;
  }

  async updateJob(id: string, patch: Partial<StoredJob>): Promise<void> {
    check(await this.db.from("jobs").update(patch).eq("id", id), "updateJob");
  }

  async upsertMappings(rows: MappingRow[]): Promise<void> {
    for (const part of chunk(rows, 300)) {
      check(await this.db.from("job_sources_mapping").upsert(part, { onConflict: "source_id,external_job_id" }), "upsertMappings");
    }
  }

  async deactivateMissing(sourceId: string, seen: string[]): Promise<number> {
    const res = await this.db.rpc("deactivate_missing_jobs", { p_source_id: sourceId, p_seen: seen });
    return Number(check(res, "deactivateMissing") ?? 0);
  }
}

/** In-memory repository for tests and demo data generation. */
export class MemoryJobRepository implements JobRepository {
  sources = new Map<string, SourceConfig>();
  jobs = new Map<string, StoredJob & { id: string; source_count: number }>();
  mappings: MappingRow[] = [];
  logs: Array<{ id: string; source_id: string; status?: string; result?: SyncResult }> = [];
  rates: ExchangeRates = { INR: 1, USD: 84, EUR: 91, GBP: 107, CAD: 61, AUD: 55, SGD: 63, AED: 23 };
  private seq = 0;

  addSource(s: Partial<SourceConfig> & { slug: string; name: string }): SourceConfig {
    const src: SourceConfig = {
      id: `src-${s.slug}`, source_type: "api", base_url: null, api_url: null, rss_url: null, enabled: true,
      min_interval_minutes: 0, retention_days: 30, full_feed: false, last_run_at: null, config: {}, http_cache: {}, ...s,
    };
    this.sources.set(src.slug, src);
    return src;
  }

  getSource(slug: string) { return Promise.resolve(this.sources.get(slug) ?? null); }
  getExchangeRates() { return Promise.resolve(this.rates); }
  startLog(sourceId: string) {
    const id = `log-${++this.seq}`;
    this.logs.push({ id, source_id: sourceId });
    return Promise.resolve(id);
  }
  finishLog(logId: string, result: SyncResult, status: string) {
    const l = this.logs.find((x) => x.id === logId);
    if (l) { l.result = result; l.status = status; }
    return Promise.resolve();
  }
  updateSource(sourceId: string, patch: Record<string, unknown>) {
    for (const s of this.sources.values()) if (s.id === sourceId) Object.assign(s, patch);
    return Promise.resolve();
  }
  findOwned(sourceId: string, ids: string[]) {
    const set = new Set(ids);
    const out = new Map<string, OwnedRef>();
    for (const j of this.jobs.values()) if (j.source_id === sourceId && set.has(j.source_job_id)) out.set(j.source_job_id, j);
    return Promise.resolve(out);
  }
  findMapped(sourceId: string, ids: string[]) {
    const set = new Set(ids);
    const out = new Map<string, string>();
    for (const m of this.mappings) if (m.source_id === sourceId && set.has(m.external_job_id)) out.set(m.external_job_id, m.job_id);
    return Promise.resolve(out);
  }
  findCandidates(q: { canonicalUrls: string[]; contentHashes: string[]; companies: string[] }) {
    const u = new Set(q.canonicalUrls), h = new Set(q.contentHashes), c = new Set(q.companies);
    return Promise.resolve([...this.jobs.values()].filter((j) => u.has(j.canonical_url) || h.has(j.content_hash) || c.has(j.normalized_company)) as ExistingJobRef[]);
  }
  insertJobs(jobs: StoredJob[]) {
    const out = new Map<string, string>();
    for (const j of jobs) {
      const id = `job-${++this.seq}`;
      this.jobs.set(id, { ...j, id, source_count: 1 });
      out.set(j.source_job_id, id);
    }
    return Promise.resolve(out);
  }
  updateJob(id: string, patch: Partial<StoredJob>) {
    const j = this.jobs.get(id);
    if (j) Object.assign(j, patch);
    return Promise.resolve();
  }
  upsertMappings(rows: MappingRow[]) {
    for (const r of rows) {
      const i = this.mappings.findIndex((m) => m.source_id === r.source_id && m.external_job_id === r.external_job_id);
      if (i >= 0) this.mappings[i] = { ...this.mappings[i], ...r, is_primary: this.mappings[i].is_primary };
      else {
        this.mappings.push(r);
        const j = this.jobs.get(r.job_id);
        if (j && !r.is_primary) j.source_count++;
      }
    }
    return Promise.resolve();
  }
  deactivateMissing(sourceId: string, seen: string[]) {
    const set = new Set(seen);
    let n = 0;
    for (const j of this.jobs.values()) {
      if (j.source_id === sourceId && j.is_active && !set.has(j.source_job_id)) { j.is_active = false; n++; }
    }
    return Promise.resolve(n);
  }
}
