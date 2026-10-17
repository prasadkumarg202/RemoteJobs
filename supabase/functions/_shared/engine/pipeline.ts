// Sync pipeline: fetch → validate → parse → normalize → classify → AI score →
// content hash → dedupe → upsert → log.

import type { SourceAdapter } from "./adapters/base.ts";
import { enrichmentPatch, findDuplicate } from "./dedupe.ts";
import { HttpClient, type FetchLike } from "./http.ts";
import { InvalidJobError, normalizeJob } from "./normalize.ts";
import type { JobRepository, MappingRow, StoredJob } from "./repository.ts";
import { sha256Hex } from "./text.ts";
import type { ExistingJobRef, NormalizedJob, SyncResult } from "./types.ts";

export interface RunOptions {
  force?: boolean;
  now?: Date;
  fetchImpl?: FetchLike;
  secrets?: Record<string, string | undefined>;
  pageDelayMs?: number;
}

/** Fields that never change on re-sync (admin-controlled or identity). */
const PRESERVE_ON_UPDATE = new Set(["slug", "is_featured", "is_verified", "moderation_status", "is_active", "source_id", "source_name", "source_job_id"]);

async function payloadHash(j: NormalizedJob): Promise<string> {
  return sha256Hex(JSON.stringify([j.title, j.company_name, j.company_logo, j.description, j.apply_url, j.salary_min, j.salary_max, j.salary_currency, j.salary_period, j.eligible_countries, j.eligible_regions, j.timezone_requirements, j.employment_type, j.expires_at, j.keywords, j.ai_score, j.risk_score]));
}

function toRef(id: string, j: NormalizedJob): ExistingJobRef {
  return {
    id, source_id: j.source_id, canonical_url: j.canonical_url, content_hash: j.content_hash, normalized_title: j.normalized_title,
    normalized_company: j.normalized_company, short_description: j.short_description, salary_min: j.salary_min, salary_max: j.salary_max,
    salary_currency: j.salary_currency, posted_at: j.posted_at, company_logo: j.company_logo, is_active: j.is_active,
  };
}

export async function runSync(adapter: SourceAdapter, repo: JobRepository, opts: RunOptions = {}): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const result: SyncResult = {
    source: adapter.slug, started_at: now.toISOString(), completed_at: now.toISOString(), jobs_found: 0, jobs_added: 0,
    jobs_updated: 0, jobs_skipped: 0, jobs_duplicates: 0, jobs_expired: 0, jobs_flagged: 0, used_fallback: false,
    not_modified: false, errors: [],
  };

  const source = await repo.getSource(adapter.slug);
  if (!source) {
    result.errors.push(`Source "${adapter.slug}" is not registered in job_sources`);
    result.skipped_reason = "unregistered";
    return result;
  }
  if (!source.enabled && !opts.force) {
    result.skipped_reason = "disabled";
    return result;
  }
  // A run that failed (no success since it started) may be retried after an hour instead of the full interval.
  const lastFailed = !!source.last_run_at && (!source.last_success_at || new Date(source.last_success_at) < new Date(source.last_run_at));
  const interval = lastFailed ? Math.min(source.min_interval_minutes, 60) : source.min_interval_minutes;
  if (!opts.force && source.last_run_at && now.getTime() - new Date(source.last_run_at).getTime() < interval * 60000) {
    result.skipped_reason = `ran less than ${interval} minutes ago (source rate policy)`;
    return result;
  }

  const logId = await repo.startLog(source.id, result.started_at);
  await repo.updateSource(source.id, { last_run_at: now.toISOString() });

  try {
    const fetched = await adapter.fetchJobs({
      source, http: new HttpClient(opts.fetchImpl), now, secrets: opts.secrets, pageDelayMs: opts.pageDelayMs,
    });
    result.used_fallback = fetched.usedFallback;
    result.not_modified = fetched.notModified;
    result.errors.push(...fetched.warnings.slice(0, 10));
    result.jobs_found = fetched.jobs.length + (fetched.invalid ?? 0);
    result.jobs_skipped += fetched.invalid ?? 0;
    if (fetched.invalid) result.errors.push(`${fetched.invalid} item(s) missing id/title/url were skipped`);

    const rates = await repo.getExchangeRates();
    const ctx = { sourceId: source.id, sourceSlug: source.slug, sourceName: source.name, rates, trustedSource: source.source_type !== "employer", now };

    // 1. Parse + normalize
    const normalized: StoredJob[] = [];
    const seenIds = new Set<string>();
    for (const raw of fetched.jobs) {
      try {
        if (seenIds.has(String(raw.sourceJobId))) continue; // duplicate inside the same payload
        const { job } = await normalizeJob(raw, ctx);
        seenIds.add(job.source_job_id);
        normalized.push({ ...job, payload_hash: await payloadHash(job) });
      } catch (e) {
        result.jobs_skipped++;
        if (result.errors.length < 25) result.errors.push(e instanceof InvalidJobError ? `Invalid job ${raw.sourceJobId || "?"}: ${e.message}` : `Normalize failed: ${(e as Error).message}`);
      }
    }

    const ids = normalized.map((j) => j.source_job_id);
    const [owned, mapped] = await Promise.all([repo.findOwned(source.id, ids), repo.findMapped(source.id, ids)]);
    const fresh = normalized.filter((j) => !owned.has(j.source_job_id) && !mapped.has(j.source_job_id));
    const candidates = await repo.findCandidates({
      canonicalUrls: fresh.map((j) => j.canonical_url),
      contentHashes: fresh.map((j) => j.content_hash),
      companies: fresh.map((j) => j.normalized_company),
    });
    // Same-source rows can't be duplicates of each other's *other* listings.
    const pool: ExistingJobRef[] = candidates;

    const mappings: MappingRow[] = [];
    const toInsert: StoredJob[] = [];
    const pendingDupes: Array<{ job: StoredJob; tempKey: string }> = [];
    const nowIso = now.toISOString();

    for (const job of normalized) {
      const own = owned.get(job.source_job_id);
      if (own) {
        mappings.push({ job_id: own.id, source_id: source.id, external_job_id: job.source_job_id, external_url: job.external_url, is_primary: true, last_seen_at: nowIso });
        if (own.payload_hash === job.payload_hash) { result.jobs_skipped++; continue; }
        const patch: Partial<StoredJob> = {};
        for (const [k, v] of Object.entries(job)) if (!PRESERVE_ON_UPDATE.has(k)) (patch as Record<string, unknown>)[k] = v;
        if (job.moderation_status === "expired") { patch.is_active = false; patch.moderation_status = "expired"; }
        // A source update that newly trips high risk pulls an approved job back to review.
        if (job.risk_level === "high" && own.moderation_status === "approved") { patch.is_active = false; patch.moderation_status = "pending"; result.jobs_flagged++; }
        await repo.updateJob(own.id, patch);
        result.jobs_updated++;
        continue;
      }
      const mappedTo = mapped.get(job.source_job_id);
      if (mappedTo) {
        mappings.push({ job_id: mappedTo, source_id: source.id, external_job_id: job.source_job_id, external_url: job.external_url, is_primary: false, last_seen_at: nowIso });
        result.jobs_skipped++;
        continue;
      }
      const dup = findDuplicate(job, pool);
      if (dup) {
        result.jobs_duplicates++;
        if (dup.match.id.startsWith("pending:")) {
          pendingDupes.push({ job, tempKey: dup.match.id });
        } else {
          mappings.push({ job_id: dup.match.id, source_id: source.id, external_job_id: job.source_job_id, external_url: job.external_url, is_primary: false, last_seen_at: nowIso });
          const patch = enrichmentPatch(dup.match, job);
          if (Object.keys(patch).length) await repo.updateJob(dup.match.id, patch);
        }
        continue;
      }
      toInsert.push(job);
      if (job.risk_level === "high") result.jobs_flagged++;
      pool.push(toRef(`pending:${job.source_job_id}`, job));
    }

    const inserted = await repo.insertJobs(toInsert);
    result.jobs_added = inserted.size;
    for (const job of toInsert) {
      const id = inserted.get(job.source_job_id);
      if (id) mappings.push({ job_id: id, source_id: source.id, external_job_id: job.source_job_id, external_url: job.external_url, is_primary: true, last_seen_at: nowIso });
    }
    for (const { job, tempKey } of pendingDupes) {
      const id = inserted.get(tempKey.slice("pending:".length));
      if (id) mappings.push({ job_id: id, source_id: source.id, external_job_id: job.source_job_id, external_url: job.external_url, is_primary: false, last_seen_at: nowIso });
    }
    await repo.upsertMappings(mappings);

    // Full-feed sources (Remote OK) list every live job: anything missing was removed upstream.
    // Guard against a truncated/empty payload wiping the catalogue.
    const fullFeedMin = Number(source.config.full_feed_min ?? 20);
    if (source.full_feed && !fetched.notModified && !fetched.usedFallback && !fetched.partial && normalized.length >= Math.max(1, fullFeedMin)) {
      result.jobs_expired = await repo.deactivateMissing(source.id, [...seenIds]);
    }

    result.completed_at = new Date().toISOString();
    await repo.updateSource(source.id, {
      last_success_at: result.completed_at,
      last_jobs_fetched: result.jobs_found,
      last_jobs_inserted: result.jobs_added,
      ...(fetched.httpCache ? { http_cache: fetched.httpCache } : {}),
      ...(fetched.configPatch ? { config: { ...source.config, ...fetched.configPatch } } : {}),
    });
    await repo.finishLog(logId, result, result.jobs_skipped > 0 && result.errors.length > 0 ? "partial" : "success");
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push(msg);
    result.completed_at = new Date().toISOString();
    await repo.updateSource(source.id, { last_error_at: result.completed_at, last_error: msg.slice(0, 500) });
    await repo.finishLog(logId, result, "failed");
    return result;
  }
}
