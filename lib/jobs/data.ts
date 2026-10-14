import "server-only";
import { cache } from "react";
import { DEMO_MODE } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import { demoGetBySlug, demoGetByIds, demoSearch, demoSectionCounts } from "./demo";
import type { JobCard, JobDetail, JobFilters, SearchResult } from "./types";

export const PAGE_SIZE = 20;

function rpcArgs(f: JobFilters) {
  const nz = <T,>(a?: T[]) => (a && a.length ? a : null);
  const limit = f.limit ?? PAGE_SIZE;
  return {
    p_query: f.q ?? null,
    p_sections: nz(f.sections),
    p_india_mode: f.india ?? null,
    p_country: f.country ?? null,
    p_regions: nz(f.regions),
    p_categories: nz(f.categories),
    p_ai_categories: nz(f.aiCategories),
    p_ai_min: f.aiMin ?? null,
    p_employment_types: nz(f.types),
    p_work_modes: nz(f.modes),
    p_seniority: nz(f.seniority),
    p_salary_min_inr: f.salaryMinInr ?? null,
    p_budget_types: nz(f.budgetTypes),
    p_durations: nz(f.durations),
    p_posted_within_days: f.postedWithin ?? null,
    p_sources: nz(f.sources),
    p_city: f.city ?? null,
    p_exclude_ids: nz(f.excludeIds),
    p_sort: f.sort ?? (f.q ? "relevance" : "newest"),
    p_limit: limit,
    p_offset: ((f.page ?? 1) - 1) * limit,
  };
}

export async function searchJobs(f: JobFilters): Promise<SearchResult> {
  if (DEMO_MODE) return demoSearch(f);
  const sb = await supabaseServer();
  const { data, error } = await sb!.rpc("search_jobs", rpcArgs(f));
  if (error) {
    console.error("search_jobs failed", error.message);
    return { total: 0, items: [] };
  }
  return data as SearchResult;
}

export const getJobBySlug = cache(async (slug: string): Promise<JobDetail | null> => {
  if (DEMO_MODE) return demoGetBySlug(slug);
  const sb = await supabaseServer();
  const { data: job } = await sb!.from("jobs").select("*").eq("slug", slug).maybeSingle();
  if (!job) return null;
  const { data: maps } = await sb!
    .from("job_sources_mapping")
    .select("external_url, is_primary, job_sources(name, slug, attribution_text, allow_structured_data)")
    .eq("job_id", job.id)
    .order("is_primary", { ascending: false });
  type MapRow = { external_url: string; is_primary: boolean; job_sources: { name: string; slug: string; attribution_text: string | null; allow_structured_data: boolean } | null };
  const sources = ((maps ?? []) as unknown as MapRow[])
    .filter((m) => m.job_sources)
    .map((m) => ({ ...m.job_sources!, external_url: m.external_url, is_primary: m.is_primary }));
  return { ...(job as JobDetail), sources };
});

export async function getJobsByIds(ids: string[]): Promise<JobCard[]> {
  if (!ids.length) return [];
  if (DEMO_MODE) return demoGetByIds(ids);
  const sb = await supabaseServer();
  const { data } = await sb!.from("jobs").select("*").in("id", ids.slice(0, 100));
  return (data ?? []) as JobCard[];
}

export async function getSectionCounts(): Promise<Record<string, number>> {
  if (DEMO_MODE) return demoSectionCounts();
  const sb = await supabaseServer();
  const { data } = await sb!.rpc("job_section_counts");
  return (data ?? {}) as Record<string, number>;
}

export async function getSavedJobIds(): Promise<string[]> {
  if (DEMO_MODE) return [];
  const sb = await supabaseServer();
  const { data: auth } = await sb!.auth.getUser();
  if (!auth.user) return [];
  const { data } = await sb!.from("saved_jobs").select("job_id").eq("user_id", auth.user.id);
  return (data ?? []).map((r: { job_id: string }) => r.job_id);
}

export async function getHiddenJobIds(): Promise<string[]> {
  if (DEMO_MODE) return [];
  const sb = await supabaseServer();
  const { data: auth } = await sb!.auth.getUser();
  if (!auth.user) return [];
  const { data } = await sb!.from("hidden_jobs").select("job_id").eq("user_id", auth.user.id);
  return (data ?? []).map((r: { job_id: string }) => r.job_id);
}
