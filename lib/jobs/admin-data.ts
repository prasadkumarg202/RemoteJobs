import "server-only";
import { DEMO_MODE } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import { DEMO_JOBS } from "./demo";

export interface SourceHealth {
  id: string; slug: string; name: string; enabled: boolean; source_type: string; last_run_at: string | null; last_success_at: string | null;
  last_error_at: string | null; last_error: string | null; last_jobs_fetched: number | null; last_jobs_inserted: number | null;
  terms_url: string | null; terms_verified_at: string | null; min_interval_minutes: number; rate_limit: string | null; active_jobs: number;
  recent_logs: Array<{ started_at: string; status: string; jobs_found: number; jobs_added: number; jobs_updated: number; jobs_duplicates: number; jobs_expired: number; used_fallback: boolean; errors: string[] }>;
}
export interface AdminStats {
  total: number; active: number; remote: number; ai: number; freelance: number; india_eligible: number; added_today: number; expired_today: number;
  duplicates: number; multi_source_jobs: number; flagged: number; pending: number; open_reports: number; sources: SourceHealth[];
}
export interface AdminAnalytics {
  events: Record<string, number>; top_searches: Array<{ query: string; n: number }>; most_viewed: Array<{ slug: string; title: string; company_name: string; n: number }>;
  most_applied_category: Array<{ category: string; n: number }>; popular_ai_skills: Array<{ skill: string; n: number }>; searches_by_section: Record<string, number>;
}

export async function getAdminStats(): Promise<AdminStats> {
  if (DEMO_MODE) {
    const j = DEMO_JOBS;
    const by = (slug: string) => j.filter((x) => x.sources.some((s) => s.slug === slug)).length;
    const OFF = ["startupjobs", "adzuna", "freelancer", "workingnomads", "arbeitnow"];
    const src = (slug: string, name: string): SourceHealth => ({ id: slug, slug, name, enabled: !OFF.includes(slug), source_type: slug === "startupjobs" ? "mcp" : "api", last_run_at: null, last_success_at: null, last_error_at: null, last_error: null, last_jobs_fetched: null, last_jobs_inserted: null, terms_url: null, terms_verified_at: OFF.includes(slug) ? null : "2026-10-14", min_interval_minutes: 360, rate_limit: null, active_jobs: by(slug), recent_logs: [] });
    return {
      total: j.length, active: j.length, remote: j.filter((x) => x.work_mode === "remote").length, ai: j.filter((x) => x.ai_score >= 40).length,
      freelance: j.filter((x) => x.sections.includes("freelance")).length, india_eligible: j.filter((x) => ["explicit", "worldwide", "region", "timezone"].includes(x.india_eligibility) && x.work_mode === "remote").length,
      added_today: 0, expired_today: 0, duplicates: j.reduce((n, x) => n + Math.max(0, x.source_count - 1), 0), multi_source_jobs: j.filter((x) => x.source_count > 1).length,
      flagged: j.filter((x) => x.risk_level !== "low").length, pending: 0, open_reports: 0,
      sources: [src("himalayas", "Himalayas"), src("jobicy", "Jobicy"), src("remoteok", "Remote OK"), src("remotive", "Remotive"), src("adzuna", "Adzuna"), src("freelancer", "Freelancer.com"), src("workingnomads", "Working Nomads"), src("arbeitnow", "Arbeitnow"), src("startupjobs", "Startup Jobs")],
    };
  }
  const sb = await supabaseServer();
  const { data, error } = await sb!.rpc("admin_job_stats");
  if (error) throw new Error(error.message);
  return data as AdminStats;
}

export async function getAdminAnalytics(days = 30): Promise<AdminAnalytics | null> {
  if (DEMO_MODE) return null;
  const sb = await supabaseServer();
  const { data } = await sb!.rpc("admin_job_analytics", { p_days: days });
  return data as AdminAnalytics;
}
