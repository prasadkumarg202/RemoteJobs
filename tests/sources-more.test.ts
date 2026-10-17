import { describe, expect, it } from "vitest";
import { AshbyAdapter, getAdapter, JoobleAdapter, runSync, splitWwrTitle, WeWorkRemotelyAdapter } from "@engine";
import { FIXTURE_NOW, fakeFetch, fixture, fixtureJson, json, makeRepo } from "./helpers.ts";

const now = FIXTURE_NOW;
function repoWith() {
  const repo = makeRepo();
  repo.addSource({ slug: "weworkremotely", name: "We Work Remotely", source_type: "rss", rss_url: "https://weworkremotely.com/remote-jobs.rss" });
  repo.addSource({ slug: "jooble", name: "Jooble", api_url: "https://jooble.org/api", config: { queries: [{ keywords: "work from home", location: "India" }] } });
  repo.addSource({ slug: "ashby", name: "Ashby", api_url: "https://api.ashbyhq.com/posting-api/job-board", full_feed: true, config: { boards: [{ token: "acme", company: "Acme AI" }], location_filter: "india_or_remote", full_feed_min: 1 } });
  return repo;
}
const jobsOf = (repo: ReturnType<typeof makeRepo>, src: string) => [...repo.jobs.values()].filter((j) => j.source_id === `src-${src}`);
const realErrors = (e: string[]) => e.filter((x) => !/were skipped/.test(x));
const rss = (body: string) => new Response(body, { headers: { "content-type": "application/rss+xml" } });

describe("registry", () => {
  it("has adapters for the new sources", () => {
    expect(getAdapter("weworkremotely").name).toBe("We Work Remotely");
    expect(getAdapter("jooble").name).toBe("Jooble");
    expect(getAdapter("ashby").name).toBe("Ashby");
  });
});

describe("We Work Remotely (RSS)", () => {
  it("splits 'Company: Title'", () => {
    expect(splitWwrTitle("Acme AI: Senior LLM Engineer ")).toEqual({ company: "Acme AI", title: "Senior LLM Engineer" });
    expect(splitWwrTitle("No company here")).toEqual({ company: null, title: "No company here" });
  });

  it("ingests jobs with links back to WWR, regions, types, logos; skips expired and foreign links", async () => {
    const repo = repoWith();
    const f = fakeFetch({ "weworkremotely.com/remote-jobs.rss": () => rss(fixture("weworkremotely.rss")) });
    const r = await runSync(new WeWorkRemotelyAdapter(), repo, { fetchImpl: f, now, force: true, pageDelayMs: 0 });
    expect(f.calls).toHaveLength(1);
    expect(realErrors(r.errors)).toEqual([]);
    expect(r.errors.join()).toMatch(/1 item/); // the non-WWR link
    const js = jobsOf(repo, "weworkremotely").filter((j) => j.is_active);
    expect(js).toHaveLength(3);
    const llm = js.find((j) => j.title === "Senior LLM Engineer")!;
    expect(llm.company_name).toBe("Acme AI");
    expect(llm.external_url).toBe("https://weworkremotely.com/remote-jobs/acme-ai-senior-llm-engineer");
    expect(llm.source_job_id).toBe("acme-ai-senior-llm-engineer");
    expect(llm.company_logo).toMatch(/^https:\/\/wwr-pro/);
    expect(llm.work_mode).toBe("remote");
    expect(llm.india_eligibility).toBe("worldwide");
    expect(llm.sections).toEqual(expect.arrayContaining(["remote", "ai"]));
    expect(llm.expires_at).toBeTruthy();
    const support = js.find((j) => j.title === "Customer Support Specialist")!;
    expect(support.india_eligibility).toBe("not_eligible");
    expect(support.employment_type).toBe("part_time");
    expect(js.find((j) => j.title === "Contract React Developer")!.employment_type).toBe("contract");
    expect(js.some((j) => j.title === "Expired Role")).toBe(false); // past expires_at → not shown
  });

  it("reads category feeds from config and keeps working when one fails", async () => {
    const repo = repoWith();
    const src = repo.sources.get("weworkremotely")!;
    src.config = { feeds: ["https://weworkremotely.com/categories/remote-programming-jobs.rss", "https://weworkremotely.com/categories/remote-design-jobs.rss", "https://evil.example/feed.rss"] };
    const f = fakeFetch({
      "weworkremotely.com/categories/remote-programming-jobs.rss": () => rss(fixture("weworkremotely.rss")),
      "weworkremotely.com/categories/remote-design-jobs.rss": () => new Response("down", { status: 503 }),
    });
    const r = await runSync(new WeWorkRemotelyAdapter(), repo, { fetchImpl: f, now, force: true, pageDelayMs: 0 });
    expect(jobsOf(repo, "weworkremotely").filter((j) => j.is_active)).toHaveLength(3);
    expect(f.calls.some((u) => u.includes("evil.example"))).toBe(false);
    expect(r.errors.join()).toMatch(/design/);
  });
});

describe("Jooble (India)", () => {
  it("needs a key", async () => {
    const r = await runSync(new JoobleAdapter(), repoWith(), { now, force: true, fetchImpl: fakeFetch({}) });
    expect(r.errors.join()).toMatch(/JOOBLE_API_KEY/);
  });

  it("POSTs the query, maps Indian part-time / WFH / local jobs, never logs the key", async () => {
    const repo = repoWith();
    let body: unknown = null;
    const f = fakeFetch({ "jooble.org/api/test-key-123": (_u, init) => { body = JSON.parse(String(init?.body)); return json(fixtureJson("jooble-in.json")); } });
    const r = await runSync(new JoobleAdapter(), repo, { fetchImpl: f, now, force: true, pageDelayMs: 0, secrets: { JOOBLE_API_KEY: "test-key-123" } });
    expect(realErrors(r.errors)).toEqual([]);
    expect(body).toEqual({ keywords: "work from home", location: "India", page: "1" });
    expect(r.jobs_added).toBe(3);
    const js = jobsOf(repo, "jooble");
    const wfh = js.find((j) => j.title.startsWith("Data Entry"))!;
    expect(wfh.title).not.toMatch(/<b>/);
    expect(wfh.work_mode).toBe("remote");
    expect(wfh.employment_type).toBe("part_time");
    expect(wfh.india_eligibility).toBe("explicit");
    expect(wfh.external_url).toBe("https://in.jooble.org/desc/8812345001");
    const tally = js.find((j) => j.title.startsWith("Accounts"))!;
    expect(tally.work_mode).toBe("onsite");
    expect(tally.sections).toContain("local");
    expect(js.find((j) => j.title === "Machine Learning Engineer")!.sections).toContain("ai");
  });

  it("hides the key in errors", async () => {
    const f = fakeFetch({ "jooble.org/api/test-key-123": () => new Response("nope", { status: 403 }) });
    const r = await runSync(new JoobleAdapter(), repoWith(), { fetchImpl: f, now, force: true, pageDelayMs: 0, secrets: { JOOBLE_API_KEY: "test-key-123" } });
    expect(r.errors.join()).not.toContain("test-key-123");
    expect(r.errors.join()).toMatch(/403/);
  });
});

describe("Ashby company boards", () => {
  it("maps remote/India jobs with salary, skips unlisted and foreign on-site jobs", async () => {
    const repo = repoWith();
    const f = fakeFetch({ "api.ashbyhq.com/posting-api/job-board/acme": () => json(fixtureJson("ashby-acme.json")) });
    const r = await runSync(new AshbyAdapter(), repo, { fetchImpl: f, now, force: true, pageDelayMs: 0 });
    expect(f.calls[0]).toContain("includeCompensation=true");
    expect(realErrors(r.errors)).toEqual([]);
    const js = jobsOf(repo, "ashby");
    expect(js.map((j) => j.title).sort()).toEqual(["Applied AI Engineer", "Office Manager", "Part-time Content Writer"]);
    const ai = js.find((j) => j.title === "Applied AI Engineer")!;
    expect([ai.salary_min, ai.salary_max, ai.salary_currency, ai.salary_period]).toEqual([4000000, 6000000, "INR", "yearly"]);
    expect(ai.work_mode).toBe("remote");
    expect(ai.apply_url).toMatch(/\/application$/);
    expect(ai.sections).toContain("ai");
    const office = js.find((j) => j.title === "Office Manager")!;
    expect([office.work_mode, office.city]).toEqual(["onsite", "Bengaluru"]);
    expect(js.find((j) => j.title.startsWith("Part-time"))!.employment_type).toBe("part_time");
  });

  it("closes jobs that disappear from the board", async () => {
    const repo = repoWith();
    const data = fixtureJson<{ jobs: unknown[] }>("ashby-acme.json");
    let jobs = data.jobs;
    const f = fakeFetch({ "api.ashbyhq.com/posting-api/job-board/acme": () => json({ jobs }) });
    await runSync(new AshbyAdapter(), repo, { fetchImpl: f, now, force: true, pageDelayMs: 0 });
    jobs = data.jobs.slice(1);
    const r = await runSync(new AshbyAdapter(), repo, { fetchImpl: f, now, force: true, pageDelayMs: 0 });
    expect(r.jobs_expired).toBe(1);
    expect(jobsOf(repo, "ashby").find((j) => j.title === "Applied AI Engineer")!.is_active).toBe(false);
  });
});
