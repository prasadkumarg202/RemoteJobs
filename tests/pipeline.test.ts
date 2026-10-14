import { describe, expect, it } from "vitest";
import { normalizeJob, HimalayasAdapter, JobicyAdapter, RemoteOkAdapter, StartupJobsAdapter, runSync, mapArgs, parseMcpBody } from "@engine";
import { FIXTURE_NOW, fakeFetch, fixture, fixtureJson, json, makeRepo, sourceFetch } from "./helpers.ts";

const opts = (fetchImpl = sourceFetch()) => ({ fetchImpl, now: FIXTURE_NOW, pageDelayMs: 0, force: true });

async function syncAll() {
  const repo = makeRepo();
  const f = sourceFetch();
  const results = [
    await runSync(new HimalayasAdapter(), repo, opts(f)),
    await runSync(new JobicyAdapter(), repo, opts(f)),
    await runSync(new RemoteOkAdapter(), repo, opts(f)),
  ];
  return { repo, results, f };
}

describe("full sync over fixtures", () => {
  it("ingests ≥50 remote, ≥20 AI and ≥20 freelance-style jobs", async () => {
    const { repo, results } = await syncAll();
    for (const r of results) expect(r.errors.filter((e) => !/^Invalid job|were skipped$/.test(e))).toEqual([]);
    const jobs = [...repo.jobs.values()];
    const live = jobs.filter((j) => j.is_active);
    expect(live.filter((j) => j.sections.includes("remote")).length).toBeGreaterThanOrEqual(50);
    expect(live.filter((j) => j.sections.includes("ai")).length).toBeGreaterThanOrEqual(20);
    expect(live.filter((j) => j.sections.includes("freelance")).length).toBeGreaterThanOrEqual(20);
  });

  it("merges the same job posted on three boards into one canonical record", async () => {
    const { repo, results } = await syncAll();
    const lumora = [...repo.jobs.values()].filter((j) => j.normalized_company === "lumora" && /llm/.test(j.normalized_title));
    expect(lumora).toHaveLength(1);
    expect(lumora[0].source_count).toBe(3);
    const sources = repo.mappings.filter((m) => m.job_id === lumora[0].id).map((m) => m.source_id).sort();
    expect(sources).toEqual(["src-himalayas", "src-jobicy", "src-remoteok"]);
    expect(results[1].jobs_duplicates + results[2].jobs_duplicates).toBeGreaterThanOrEqual(3);
  });

  it("skips invalid jobs, flags scams and keeps expired jobs inactive", async () => {
    const { repo, results } = await syncAll();
    expect(results[1].jobs_skipped).toBeGreaterThanOrEqual(1); // Jobicy item without url
    const jobs = [...repo.jobs.values()];
    const scam = jobs.find((j) => j.title.includes("Earn $500"))!;
    expect(scam.risk_level).toBe("high");
    expect(scam.is_active).toBe(false);
    expect(scam.moderation_status).toBe("pending");
  });

  it("stores jobs past their expiry date as inactive/expired", async () => {
    const { job } = await normalizeJob(
      { sourceJobId: "x1", externalUrl: "https://himalayas.app/companies/a/jobs/x1", title: "Ruby Developer", companyName: "Oldtown Apps", descriptionHtml: "<p>Ruby on Rails.</p>", expiresAt: "2026-01-01T00:00:00Z", workModeHint: "remote" },
      { sourceId: "s", sourceSlug: "himalayas", sourceName: "Himalayas", rates: { INR: 1, USD: 84 }, trustedSource: true, now: FIXTURE_NOW },
    );
    expect(job.is_active).toBe(false);
    expect(job.moderation_status).toBe("expired");
  });

  it("handles missing salary, logo, company and location gracefully", async () => {
    const { repo } = await syncAll();
    const j = [...repo.jobs.values()].find((x) => x.title === "Operations Assistant")!;
    expect(j.company_name).toBe("Company not disclosed");
    expect(j.company_logo).toBeNull();
    expect(j.salary_min).toBeNull();
    expect(j.salary_max).toBeNull();
    expect(j.india_eligibility).toBe("unknown");
  });

  it("never marks US-only roles India eligible, and keeps worldwide ones", async () => {
    const { repo } = await syncAll();
    const jobs = [...repo.jobs.values()];
    for (const j of jobs.filter((x) => x.eligible_countries.length === 1 && x.eligible_countries[0] === "US")) {
      expect(j.india_eligibility).toBe("not_eligible");
    }
    expect(jobs.find((j) => j.title === "Senior Backend Engineer (Node.js)")?.india_eligibility).toBe("worldwide");
    expect(jobs.find((j) => j.title.startsWith("Virtual Assistant"))?.india_eligibility).toBe("timezone");
  });

  it("preserves the original salary and adds approximate INR", async () => {
    const { repo } = await syncAll();
    const j = [...repo.jobs.values()].find((x) => x.title === "Senior Backend Engineer (Node.js)")!;
    expect([j.salary_min, j.salary_max, j.salary_currency, j.salary_period]).toEqual([100000, 140000, "USD", "yearly"]);
    expect(j.salary_inr_min).toBe(100000 * 84);
  });

  it("derives freelance budgets", async () => {
    const { repo } = await syncAll();
    const gig = [...repo.jobs.values()].find((x) => x.title.startsWith("Freelance React Developer"))!;
    expect(gig.employment_type).toBe("freelance");
    expect(gig.budget_type).toBe("hourly");
    expect([gig.budget_min, gig.budget_max]).toEqual([30, 50]);
  });

  it("is idempotent: a second sync updates nothing", async () => {
    const { repo } = await syncAll();
    const before = repo.jobs.size;
    const r = await runSync(new JobicyAdapter(), repo, opts());
    expect(repo.jobs.size).toBe(before);
    expect(r.jobs_added).toBe(0);
    expect(r.jobs_updated).toBe(0);
  });
});

describe("failure handling", () => {
  it("falls back to RSS when the JSON API fails", async () => {
    const repo = makeRepo();
    const f = fakeFetch({
      "remoteok.com/api": () => new Response("upstream down", { status: 503 }),
      "remoteok.com/remote-jobs.rss": () => new Response(fixture("remoteok.rss")),
    });
    const r = await runSync(new RemoteOkAdapter(), repo, opts(f));
    expect(r.used_fallback).toBe(true);
    expect(r.jobs_added).toBe(3);
    expect(r.errors[0]).toMatch(/RSS fallback/);
  });

  it("records an error (and does not throw) when API and RSS both fail", async () => {
    const repo = makeRepo();
    const f = fakeFetch({
      "remoteok.com/api": () => new Response("bad", { status: 500 }),
      "remoteok.com/remote-jobs.rss": () => new Response("<html>blocked</html>"),
    });
    const r = await runSync(new RemoteOkAdapter(), repo, opts(f));
    expect(r.jobs_added).toBe(0);
    expect(r.errors.join(" ")).toMatch(/RSS fallback failed/);
    expect((repo.sources.get("remoteok") as unknown as { last_error?: string }).last_error).toBeTruthy();
    expect(repo.logs.at(-1)!.status).toBe("failed");
  });

  it("treats an empty response as a valid empty sync", async () => {
    const repo = makeRepo();
    const f = fakeFetch({ "jobicy.com/api/v2/remote-jobs": () => json({ jobCount: 0, jobs: [] }) });
    const r = await runSync(new JobicyAdapter(), repo, opts(f));
    expect(r.errors).toEqual([]);
    expect(r.jobs_found).toBe(0);
  });

  it("rejects a malformed payload", async () => {
    const repo = makeRepo();
    const f = fakeFetch({ "himalayas.app/jobs/api": () => json({ message: "maintenance" }), "himalayas.app/jobs/rss": () => new Response("nope", { status: 500 }) });
    const r = await runSync(new HimalayasAdapter(), repo, opts(f));
    expect(r.errors.join(" ")).toMatch(/missing jobs/);
  });

  it("stops on HTTP 429 instead of hammering the source", async () => {
    const repo = makeRepo();
    const f = fakeFetch({ "himalayas.app/jobs/api": () => new Response("slow down", { status: 429, headers: { "retry-after": "3600" } }), "himalayas.app/jobs/rss": () => new Response("", { status: 429, headers: { "retry-after": "3600" } }) });
    const r = await runSync(new HimalayasAdapter(), repo, opts(f));
    expect(r.errors.join(" ")).toMatch(/Rate limited/);
    expect(f.calls.length).toBeLessThanOrEqual(2);
  });

  it("respects the source's minimum polling interval", async () => {
    const repo = makeRepo();
    repo.sources.get("jobicy")!.min_interval_minutes = 360;
    const f = sourceFetch();
    await runSync(new JobicyAdapter(), repo, { fetchImpl: f, now: FIXTURE_NOW, pageDelayMs: 0 });
    const calls = f.calls.length;
    const r2 = await runSync(new JobicyAdapter(), repo, { fetchImpl: f, now: new Date(FIXTURE_NOW.getTime() + 30 * 60000), pageDelayMs: 0 });
    expect(r2.skipped_reason).toMatch(/360 minutes/);
    expect(f.calls.length).toBe(calls);
  });

  it("skips disabled sources unless forced", async () => {
    const repo = makeRepo();
    repo.sources.get("remoteok")!.enabled = false;
    const r = await runSync(new RemoteOkAdapter(), repo, { fetchImpl: sourceFetch(), now: FIXTURE_NOW });
    expect(r.skipped_reason).toBe("disabled");
  });

  it("deactivates jobs removed from a full feed (Remote OK)", async () => {
    const repo = makeRepo();
    await runSync(new RemoteOkAdapter(), repo, opts());
    const all = fixtureJson<unknown[]>("remoteok.json");
    const fewer = all.filter((_, i) => i < 1 || i > 3); // drop three regular listings
    const r = await runSync(new RemoteOkAdapter(), repo, opts(fakeFetch({ "remoteok.com/api": () => json(fewer) })));
    expect(r.jobs_expired).toBe(3);
  });

  it("uses Jobicy taxonomy slugs and skips unknown ones", async () => {
    const repo = makeRepo();
    repo.sources.get("jobicy")!.config = { queries: [{ geo: "apac" }, { geo: "mars" }] };
    const r = await runSync(new JobicyAdapter(), repo, opts());
    expect(r.errors.join(" ")).toMatch(/Unknown Jobicy geo "mars"/);
    expect((repo.sources.get("jobicy")!.config as { taxonomy?: { locations: string[] } }).taxonomy?.locations).toContain("apac");
  });
});

describe("Startup Jobs MCP adapter", () => {
  it("maps arguments onto the tool schema", () => {
    expect(mapArgs({ keyword: "AI", remote: true, country: "IN" }, { query: { type: "string" }, remote: { type: "boolean" }, countries: { type: "array" } }))
      .toEqual({ query: "AI", remote: true, countries: ["IN"] });
  });
  it("parses SSE frames", () => {
    expect(parseMcpBody('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n')).toMatchObject({ result: { ok: true } });
  });
  it("runs initialize → tools/list → tools/call and maps jobs", async () => {
    const repo = makeRepo();
    const f = fakeFetch({
      "api.startup.jobs/mcp": async (_u, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.method === "initialize") return json({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-03-26" } }, 200, { "mcp-session-id": "s1" });
        if (body.method === "notifications/initialized") return new Response("", { status: 202 });
        if (body.method === "tools/list") return json({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "search_jobs", inputSchema: { properties: { keyword: { type: "string" }, remote: { type: "boolean" } } } }] } });
        const payload = { jobs: [{ id: "sj-1", title: "Founding AI Engineer", company: { name: "Nimbus" }, url: "https://startup.jobs/founding-ai-engineer-nimbus-1", remote: true, locations: ["Worldwide"], description: "Build LLM agents with Claude and RAG.", published_at: FIXTURE_NOW.toISOString() }] };
        return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(payload) }] } })}\n\n`, { headers: { "content-type": "text/event-stream" } });
      },
    });
    const r = await runSync(new StartupJobsAdapter(), repo, opts(f));
    expect(r.errors).toEqual([]);
    const job = [...repo.jobs.values()][0];
    expect(job.title).toBe("Founding AI Engineer");
    expect(job.source_name).toBe("Startup Jobs");
    expect(job.india_eligibility).toBe("worldwide");
  });
});
