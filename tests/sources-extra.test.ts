import { describe, expect, it } from "vitest";
import { AdzunaAdapter, ArbeitnowAdapter, FreelancerAdapter, RemotiveAdapter, runSync, WorkingNomadsAdapter } from "@engine";
import { FIXTURE_NOW, fakeFetch, fixtureJson, json, makeRepo } from "./helpers.ts";

const now = FIXTURE_NOW;
function repoWith() {
  const repo = makeRepo();
  repo.addSource({ slug: "remotive", name: "Remotive", api_url: "https://remotive.com/api/remote-jobs" });
  repo.addSource({ slug: "adzuna", name: "Adzuna", api_url: "https://api.adzuna.com/v1/api/jobs", config: { queries: [{ country: "in", pages: 1 }] } });
  repo.addSource({ slug: "freelancer", name: "Freelancer.com", api_url: "https://www.freelancer.com/api/projects/0.1/projects/active/", base_url: "https://www.freelancer.com" });
  repo.addSource({ slug: "workingnomads", name: "Working Nomads", api_url: "https://www.workingnomads.com/api/exposed_jobs/" });
  repo.addSource({ slug: "arbeitnow", name: "Arbeitnow", api_url: "https://www.arbeitnow.com/api/job-board-api" });
  return repo;
}
const jobsOf = (repo: ReturnType<typeof makeRepo>, src: string) => [...repo.jobs.values()].filter((j) => j.source_id === `src-${src}`);

describe("Remotive", () => {
  it("ingests jobs with attribution-friendly links, salary text and eligibility", async () => {
    const repo = repoWith();
    const f = fakeFetch({ "remotive.com/api/remote-jobs": () => json(fixtureJson("remotive.json")) });
    const r = await runSync(new RemotiveAdapter(), repo, { fetchImpl: f, now, force: true, pageDelayMs: 0 });
    expect(r.jobs_added).toBe(6);
    expect(r.jobs_skipped).toBe(1);
    expect(f.calls).toHaveLength(1); // one request per run
    const js = jobsOf(repo, "remotive");
    const llm = js.find((j) => j.title === "LLM Engineer")!;
    expect(llm.external_url).toMatch(/^https:\/\/remotive\.com\//);
    expect(llm.ai_relevance).toBe("strong_ai");
    expect([llm.salary_min, llm.salary_max, llm.salary_currency]).toEqual([90000, 130000, "USD"]);
    expect(js.find((j) => j.title.startsWith("React"))!.india_eligibility).toBe("explicit");
    expect(js.find((j) => j.title.startsWith("Customer Support"))!.india_eligibility).toBe("not_eligible");
    expect(js.find((j) => j.title.startsWith("Freelance Content"))!.employment_type).toBe("freelance");
    expect(js.find((j) => j.title.startsWith("Data Analyst"))!.india_eligibility).toBe("region");
  });
});

describe("Adzuna (India)", () => {
  it("needs keys", async () => {
    const r = await runSync(new AdzunaAdapter(), repoWith(), { now, force: true, fetchImpl: fakeFetch({}) });
    expect(r.errors.join()).toMatch(/ADZUNA_APP_ID/);
  });
  it("maps local Indian jobs, hides predicted salaries, sends keys only server-side", async () => {
    const repo = repoWith();
    const f = fakeFetch({ "api.adzuna.com/v1/api/jobs/in/search/1": () => json(fixtureJson("adzuna-in.json")) });
    const r = await runSync(new AdzunaAdapter(), repo, { fetchImpl: f, now, force: true, pageDelayMs: 0, secrets: { ADZUNA_APP_ID: "id", ADZUNA_APP_KEY: "key" } });
    expect(r.errors).toEqual([]);
    expect(r.jobs_added).toBe(5);
    expect(f.calls[0]).toMatch(/app_id=id&app_key=key/);
    const js = jobsOf(repo, "adzuna");
    const tally = js.find((j) => j.title.startsWith("Accounts"))!;
    expect([tally.city, tally.state, tally.work_mode]).toEqual(["Vijayawada", "Andhra Pradesh", "onsite"]);
    expect(tally.sections).toContain("local");
    expect([tally.salary_min, tally.salary_currency, tally.salary_period]).toEqual([240000, "INR", "yearly"]);
    expect(js.find((j) => j.title === "Python Developer")!.salary_min).toBeNull(); // predicted → hidden
    const wfh = js.find((j) => j.title.startsWith("Data Entry"))!;
    expect(wfh.work_mode).toBe("remote");
    expect(wfh.india_eligibility).toBe("explicit");
    expect(js.find((j) => j.title === "Machine Learning Engineer")!.sections).toContain("ai");
  });
});

describe("Freelancer.com", () => {
  it("needs a token", async () => {
    const r = await runSync(new FreelancerAdapter(), repoWith(), { now, force: true, fetchImpl: fakeFetch({}) });
    expect(r.errors.join()).toMatch(/FREELANCER_OAUTH_TOKEN/);
  });
  it("maps projects to freelance gigs with budgets, skips closed ones, sends the OAuth header", async () => {
    const repo = repoWith();
    let header: string | null = null;
    const f = fakeFetch({ "www.freelancer.com/api/projects/0.1/projects/active": (_u, init) => { header = new Headers(init?.headers).get("freelancer-oauth-v1"); return json(fixtureJson("freelancer.json")); } });
    const r = await runSync(new FreelancerAdapter(), repo, { fetchImpl: f, now, force: true, pageDelayMs: 0, secrets: { FREELANCER_OAUTH_TOKEN: "tok" } });
    expect(r.errors).toEqual([]);
    expect(header).toBe("tok");
    const js = jobsOf(repo, "freelancer");
    expect(js).toHaveLength(4); // closed project skipped
    const n8n = js.find((j) => j.title.includes("n8n"))!;
    expect(n8n.external_url).toBe("https://www.freelancer.com/projects/n8n/Build-workflow-sync-WhatsApp-leads");
    expect([n8n.employment_type, n8n.budget_type, n8n.budget_min, n8n.budget_currency]).toEqual(["freelance", "fixed_price", 12500, "INR"]);
    expect(n8n.sections).toEqual(expect.arrayContaining(["freelance", "remote", "ai"]));
    expect(n8n.india_eligibility).toBe("worldwide");
    const video = js.find((j) => j.title.includes("Video editor"))!;
    expect(video.budget_type).toBe("hourly");
    expect(["6_plus_months", "ongoing"]).toContain(video.job_duration);
    expect(js.find((j) => j.title.includes("PDF"))!.job_duration).toBe("one_time");
  });
});

describe("Working Nomads & Arbeitnow", () => {
  it("Working Nomads: ids from URLs, timezone locations, US/Canada restriction", async () => {
    const repo = repoWith();
    const f = fakeFetch({ "www.workingnomads.com/api/exposed_jobs": () => json(fixtureJson("workingnomads.json")) });
    const r = await runSync(new WorkingNomadsAdapter(), repo, { fetchImpl: f, now, force: true });
    expect(r.jobs_added).toBe(3);
    const js = jobsOf(repo, "workingnomads");
    expect(js.find((j) => j.title === "Virtual Assistant")!.india_eligibility).toBe("timezone");
    expect(js.find((j) => j.title === "Marketing Manager")!.india_eligibility).toBe("not_eligible");
    expect(js.find((j) => j.title.startsWith("Senior Backend"))!.source_job_id).toBe("77001");
  });
  it("Arbeitnow: remote-only by default, never assumes worldwide", async () => {
    const repo = repoWith();
    const f = fakeFetch({ "www.arbeitnow.com/api/job-board-api": () => json(fixtureJson("arbeitnow.json")) });
    const r = await runSync(new ArbeitnowAdapter(), repo, { fetchImpl: f, now, force: true, pageDelayMs: 0 });
    expect(r.jobs_added).toBe(2);
    const js = jobsOf(repo, "arbeitnow");
    expect(js.find((j) => j.title.startsWith("Frontend"))!.india_eligibility).toBe("not_eligible"); // Germany
    expect(js.find((j) => j.title.startsWith("MLOps"))!.india_eligibility).toBe("unknown"); // "Berlin" – not assumed worldwide
  });
});
