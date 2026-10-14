// SourceAdapter contract. Adding a new authorized source (e.g. a freelance
// marketplace with an official API) means writing one adapter and inserting one
// row into public.job_sources — no schema changes.

import type { HttpClient } from "../http.ts";
import type { RawJob, SourceConfig } from "../types.ts";

export interface FetchContext {
  source: SourceConfig;
  http: HttpClient;
  now: Date;
  /** Server-side secrets (never shipped to the browser). */
  secrets?: Record<string, string | undefined>;
  /** Delay between paged requests; tests set this to 0. */
  pageDelayMs?: number;
}

export interface FetchResult {
  jobs: RawJob[];
  usedFallback: boolean;
  notModified: boolean;
  /** Persisted to job_sources.http_cache (ETag / Last-Modified). */
  httpCache?: Record<string, unknown>;
  /** Persisted (merged) into job_sources.config, e.g. cached taxonomies. */
  configPatch?: Record<string, unknown>;
  warnings: string[];
  /** Items dropped by the adapter because they lacked required fields (id/title/url). */
  invalid?: number;
}

export interface SourceAdapter {
  readonly slug: string;
  readonly name: string;
  fetchJobs(ctx: FetchContext): Promise<FetchResult>;
}

export class SourceValidationError extends Error {}

export function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function strList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? str((x as Record<string, unknown>).name ?? (x as Record<string, unknown>).title) : str(x)))
      .filter((x): x is string => !!x);
  }
  if (typeof v === "string") return v.split(/\s*[,;|]\s*/).filter(Boolean);
  return [];
}

/** Runs the primary fetch; on failure (or empty when `fallbackOnEmpty`) tries the RSS fallback. */
export async function withRssFallback(
  primary: () => Promise<FetchResult>,
  fallback: (() => Promise<FetchResult>) | null,
): Promise<FetchResult> {
  try {
    return await primary();
  } catch (e) {
    if (!fallback) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const r = await fallback();
      return { ...r, usedFallback: true, warnings: [`Primary API failed (${msg}); used RSS fallback`, ...r.warnings] };
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(`Primary API failed (${msg}); RSS fallback failed (${msg2})`);
    }
  }
}
