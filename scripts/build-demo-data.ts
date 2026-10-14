// Builds data/demo-jobs.json by running the bundled fixtures through the real
// ingestion pipeline (normalize → classify → dedupe), plus a few sample local
// employer jobs from fictional businesses. Used only when Supabase isn't configured.
//   npx tsx scripts/build-demo-data.ts

import { readFileSync, writeFileSync } from "node:fs";
import {
  AdzunaAdapter, ArbeitnowAdapter, employerSubmissionToRaw, FreelancerAdapter, HimalayasAdapter, JobicyAdapter, MemoryJobRepository, normalizeJob,
  RemoteOkAdapter, RemotiveAdapter, runSync, WorkingNomadsAdapter, type FetchLike,
} from "../supabase/functions/_shared/engine/index.ts";

const fx = (n: string) => readFileSync(new URL(`../tests/fixtures/${n}`, import.meta.url), "utf8");
const fetchImpl: FetchLike = async (input) => {
  const u = new URL(input);
  const body = u.hostname.includes("himalayas") ? fx("himalayas.json")
    : u.hostname.includes("jobicy") ? (u.searchParams.get("get") ? "{}" : fx("jobicy.json"))
    : u.hostname.includes("remotive") ? fx("remotive.json")
    : u.hostname.includes("adzuna") ? fx("adzuna-in.json")
    : u.hostname.includes("freelancer") ? fx("freelancer.json")
    : u.hostname.includes("workingnomads") ? fx("workingnomads.json")
    : u.hostname.includes("arbeitnow") ? fx("arbeitnow.json")
    : fx("remoteok.json");
  return new Response(body, { headers: { "content-type": "application/json" } });
};

const now = new Date(JSON.parse(fx("himalayas.json")).updatedAt);
const repo = new MemoryJobRepository();
const meta = {
  himalayas: { attribution_text: "Source: Himalayas", allow_structured_data: false },
  jobicy: { attribution_text: "Source: Jobicy", allow_structured_data: false },
  remoteok: { attribution_text: "Source: Remote OK", allow_structured_data: false },
  remotive: { attribution_text: "Source: Remotive", allow_structured_data: false },
  adzuna: { attribution_text: "Jobs by Adzuna", allow_structured_data: false },
  freelancer: { attribution_text: "Source: Freelancer.com", allow_structured_data: false },
  workingnomads: { attribution_text: "Source: Working Nomads", allow_structured_data: false },
  arbeitnow: { attribution_text: "Source: Arbeitnow", allow_structured_data: false },
  employer: { attribution_text: "Source: Mana Kosamu Employer", allow_structured_data: true },
};
repo.addSource({ slug: "himalayas", name: "Himalayas", api_url: "https://himalayas.app/jobs/api" });
repo.addSource({ slug: "jobicy", name: "Jobicy", api_url: "https://jobicy.com/api/v2/remote-jobs" });
repo.addSource({ slug: "remoteok", name: "Remote OK", api_url: "https://remoteok.com/api", full_feed: true });
repo.addSource({ slug: "remotive", name: "Remotive", api_url: "https://remotive.com/api/remote-jobs" });
repo.addSource({ slug: "adzuna", name: "Adzuna", api_url: "https://api.adzuna.com/v1/api/jobs", config: { queries: [{ country: "in", pages: 1 }] } });
repo.addSource({ slug: "freelancer", name: "Freelancer.com", base_url: "https://www.freelancer.com" });
repo.addSource({ slug: "workingnomads", name: "Working Nomads" });
repo.addSource({ slug: "arbeitnow", name: "Arbeitnow" });
const secrets = { ADZUNA_APP_ID: "demo", ADZUNA_APP_KEY: "demo", FREELANCER_OAUTH_TOKEN: "demo" };
for (const a of [new HimalayasAdapter(), new JobicyAdapter(), new RemoteOkAdapter(), new RemotiveAdapter(), new AdzunaAdapter(), new FreelancerAdapter(), new WorkingNomadsAdapter(), new ArbeitnowAdapter()]) {
  const r = await runSync(a, repo, { fetchImpl, now, pageDelayMs: 0, force: true, secrets });
  console.log(`${a.slug}: +${r.jobs_added} (dupes ${r.jobs_duplicates})`);
}

// Sample local jobs (fictional businesses), approved as if moderated.
const site = "https://manakosamu.com";
const local = [
  { submissionId: "demo-local-1", contactName: "Sample", companyName: "Sri Lakshmi Textiles (sample)", title: "Billing Executive (Tally)", description: "Handle billing and GST invoices in Tally at our showroom. Freshers with Tally knowledge can apply. Telugu and basic English required.\n\nTimings: 10am–8pm, Sunday off.", salaryMin: 14000, salaryMax: 18000, salaryPeriod: "monthly", city: "Vijayawada", state: "Andhra Pradesh", workMode: "onsite" as const, employmentType: "full_time" as const, skills: ["tally", "excel"], applicationMethod: "email" as const, applyEmail: "jobs@example.com" },
  { submissionId: "demo-local-2", contactName: "Sample", companyName: "Green Bowl Café (sample)", title: "Social Media & Reels Creator", description: "Create Instagram Reels and posts for our café, 3 days a week at the café, rest from home. Canva and CapCut experience preferred.", salaryMin: 12000, salaryMax: 20000, salaryPeriod: "monthly", city: "Hyderabad", state: "Telangana", workMode: "hybrid" as const, employmentType: "part_time" as const, skills: ["reels", "canva"], applicationMethod: "external_url" as const, applyUrl: "https://example.com/apply" },
  { submissionId: "demo-local-3", contactName: "Sample", companyName: "Vizag Coastal Logistics (sample)", title: "Warehouse Supervisor", description: "Supervise loading and dispatch at our Gajuwaka warehouse. 2+ years of experience in logistics. Shift allowance provided.", salaryMin: 22000, salaryMax: 28000, salaryPeriod: "monthly", city: "Visakhapatnam", state: "Andhra Pradesh", workMode: "onsite" as const, employmentType: "full_time" as const, skills: ["logistics"], applicationMethod: "email" as const, applyEmail: "hr@example.com" },
];
const employerJobs = [];
for (const s of local) {
  const { job } = await normalizeJob(employerSubmissionToRaw(s, site), { sourceId: "src-employer", sourceSlug: "employer", sourceName: "Mana Kosamu Employer", rates: repo.rates, trustedSource: false, now });
  employerJobs.push({ ...job, id: s.submissionId, is_active: true, moderation_status: "approved", is_verified: true, source_count: 1, external_url: `${site}/jobs/${job.slug}` });
}

const slugById = new Map([...repo.sources.values()].map((s) => [s.id, s.slug]));
const jobs = [...[...repo.jobs.values()].filter((j) => j.is_active && j.moderation_status === "approved"), ...employerJobs].map((j) => {
  const maps = repo.mappings.filter((m) => m.job_id === j.id);
  const sources = (maps.length ? maps : [{ source_id: "src-employer", external_url: j.external_url, is_primary: true }]).map((m) => {
    const slug = slugById.get(m.source_id) ?? "employer";
    const name = slug === "employer" ? "Mana Kosamu Employer" : repo.sources.get(slug)!.name;
    return { name, slug, external_url: m.external_url, is_primary: m.is_primary, ...meta[slug as keyof typeof meta] };
  });
  const { payload_hash: _p, normalized_title: _t, normalized_company: _c, normalized_location: _l, content_hash: _h, ...rest } = j as Record<string, unknown>;
  return { ...rest, sources };
});

writeFileSync(new URL("../data/demo-jobs.json", import.meta.url), JSON.stringify({ generated_at: now.toISOString(), jobs }));
console.log(`wrote ${jobs.length} demo jobs`);
