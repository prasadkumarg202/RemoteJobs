// Regressions found on the live AapStack deployment (2026-10-16).
import { describe, expect, it } from "vitest";
import { JobicyAdapter, runSync } from "@engine";
import { FIXTURE_NOW, fakeFetch, fixtureJson, json, makeRepo } from "./helpers.ts";

const now = FIXTURE_NOW;

describe("rate policy after a failed run", () => {
  it("waits the full interval after a success, but only an hour after a failure", async () => {
    const repo = makeRepo();
    const src = repo.sources.get("jobicy")!;
    src.min_interval_minutes = 360;
    const f = fakeFetch({ "jobicy.com/api/v2/remote-jobs": () => json(fixtureJson("jobicy.json")) });
    const ago = (m: number) => new Date(now.getTime() - m * 60000).toISOString();

    Object.assign(src, { last_run_at: ago(90), last_success_at: ago(89) }); // succeeded 1.5 h ago
    expect((await runSync(new JobicyAdapter(), repo, { fetchImpl: f, now, pageDelayMs: 0 })).skipped_reason).toMatch(/360 minutes/);

    Object.assign(src, { last_run_at: ago(90), last_success_at: ago(2000) }); // the run 1.5 h ago failed
    expect((await runSync(new JobicyAdapter(), repo, { fetchImpl: f, now, pageDelayMs: 0 })).skipped_reason).toBeUndefined();

    Object.assign(src, { last_run_at: ago(30), last_success_at: null }); // failed 30 min ago
    expect((await runSync(new JobicyAdapter(), repo, { fetchImpl: f, now, pageDelayMs: 0 })).skipped_reason).toMatch(/60 minutes/);
  });
});

describe("Jobicy queries", () => {
  it("skips tags shorter than 3 characters and keeps the other queries when one fails", async () => {
    const repo = makeRepo();
    repo.sources.get("jobicy")!.config = { queries: [{ count: 50 }, { count: 50, tag: "ai" }, { count: 50, tag: "artificial intelligence" }] };
    const calls: string[] = [];
    const f = fakeFetch({
      "jobicy.com/api/v2/remote-jobs": (u) => {
        calls.push(u.search);
        if (u.searchParams.get("tag") === "artificial intelligence") return json({ success: false, error: "temporary" }, 500);
        return json(fixtureJson("jobicy.json"));
      },
    });
    const r = await runSync(new JobicyAdapter(), repo, { fetchImpl: f, now, pageDelayMs: 0, force: true });
    expect(calls.some((c) => c.includes("tag=ai&") || c.endsWith("tag=ai"))).toBe(false);
    expect(r.used_fallback).toBe(false);
    expect(r.jobs_added).toBeGreaterThan(5);
    expect(r.errors.join(" ")).toMatch(/shorter than 3 characters/);
    expect(r.errors.join(" ")).toMatch(/failed/);
  });
});
