// End-to-end: real Postgres + PostgREST + supabase-js + migrations + RLS + RPCs.
// Runs only when INTEGRATION_PGRST=http://localhost:3011 (see tests/sql/setup-db.sh).
import { createHmac } from "node:crypto";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HimalayasAdapter, JobicyAdapter, RemoteOkAdapter, runSync, SupabaseJobRepository } from "@engine";
import { FIXTURE_NOW, sourceFetch } from "./helpers.ts";

const PGRST = process.env.INTEGRATION_PGRST;
const SECRET = process.env.INTEGRATION_JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(payload: Record<string, unknown>) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload });
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
}

describe.skipIf(!PGRST)("integration: Supabase schema + pipeline", () => {
  let server: http.Server;
  let url = "";
  let service: SupabaseClient;
  let anon: SupabaseClient;

  beforeAll(async () => {
    // supabase-js calls /rest/v1/*; PostgREST serves at /. Tiny path-stripping proxy.
    const target = new URL(PGRST!);
    server = http.createServer((req, res) => {
      const path = (req.url ?? "/").replace(/^\/rest\/v1/, "");
      const p = http.request({ host: target.hostname, port: target.port, path, method: req.method, headers: { ...req.headers, host: target.host } }, (r) => {
        res.writeHead(r.statusCode ?? 500, r.headers);
        r.pipe(res);
      });
      req.pipe(p);
    });
    await new Promise<void>((r) => server.listen(0, r));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    service = createClient(url, jwt({ role: "service_role" }), { auth: { persistSession: false } });
    anon = createClient(url, jwt({ role: "anon" }), { auth: { persistSession: false } });

    const repo = new SupabaseJobRepository(service);
    const f = sourceFetch();
    for (const a of [new HimalayasAdapter(), new JobicyAdapter(), new RemoteOkAdapter()]) {
      const r = await runSync(a, repo, { fetchImpl: f, now: FIXTURE_NOW, pageDelayMs: 0, force: true });
      expect(r.errors.filter((e) => !/^Invalid job|were skipped$/.test(e))).toEqual([]);
    }
  }, 60000);

  afterAll(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

  const search = async (args: Record<string, unknown>) => {
    const { data, error } = await anon.rpc("search_jobs", args);
    if (error) throw new Error(error.message);
    return data as { total: number; items: Array<Record<string, unknown>> };
  };

  it("public search sees ≥50 remote, ≥20 AI, ≥20 freelance jobs", async () => {
    expect((await search({ p_sections: ["remote"], p_limit: 1 })).total).toBeGreaterThanOrEqual(50);
    expect((await search({ p_sections: ["ai"], p_limit: 1 })).total).toBeGreaterThanOrEqual(20);
    expect((await search({ p_sections: ["freelance"], p_limit: 1 })).total).toBeGreaterThanOrEqual(20);
  });

  it("dedupes cross-posted jobs and records every source", async () => {
    const { data } = await service.from("jobs").select("id,source_count,title").ilike("normalized_company", "lumora").ilike("title", "%LLM%");
    expect(data).toHaveLength(1);
    expect(data![0].source_count).toBe(3);
    const { data: maps } = await anon.from("job_sources_mapping").select("external_url, job_sources(name)").eq("job_id", data![0].id);
    expect(maps).toHaveLength(3);
  });

  it("full-text search handles the example queries", async () => {
    for (const q of ["n8n", "ChatGPT", "Python", "SQL DBA", "Azure", "video editing", "data entry"]) {
      const r = await search({ p_query: q, p_limit: 5 });
      expect(r.total, q).toBeGreaterThan(0);
    }
    const r = await search({ p_query: "n8n", p_limit: 5 });
    expect(String(r.items[0].title)).toMatch(/n8n|Automation|Chatbot/i);
  });

  it("India filters never include US-only jobs", async () => {
    for (const mode of ["india_only", "india_apac", "worldwide", "eligible"]) {
      const r = await search({ p_india_mode: mode, p_sections: ["remote"], p_limit: 100 });
      expect(r.total, mode).toBeGreaterThan(0);
      for (const j of r.items) expect((j.eligible_countries as string[]).join(), mode).not.toBe("US");
    }
    const only = await search({ p_india_mode: "india_only", p_limit: 100 });
    for (const j of only.items) expect(j.india_eligibility).toBe("explicit");
  });

  it("filters by AI category, employment type, salary and freshness", async () => {
    expect((await search({ p_ai_categories: ["machine-learning"], p_limit: 1 })).total).toBeGreaterThan(0);
    const gigs = await search({ p_employment_types: ["freelance", "gig"], p_limit: 100 });
    for (const j of gigs.items) expect(["freelance", "gig"]).toContain(j.employment_type);
    const rich = await search({ p_salary_min_inr: 10_000_000, p_limit: 100 });
    expect(rich.total).toBeGreaterThan(0);
    const fresh = await search({ p_posted_within_days: 1, p_limit: 100 });
    const all = await search({ p_limit: 1 });
    expect(fresh.total).toBeLessThan(all.total);
  });

  it("RLS hides pending/high-risk jobs and admin data from the public", async () => {
    const scam = await search({ p_query: "Earn $500", p_limit: 5 });
    expect(scam.items.find((j) => String(j.title).includes("Earn $500"))).toBeUndefined();
    const { data: logs } = await anon.from("job_sync_logs").select("id");
    expect(logs).toEqual([]);
    const stats = await anon.rpc("admin_job_stats");
    expect(stats.error).toBeTruthy();
    const { error: writeErr } = await anon.from("jobs").update({ is_featured: true }).neq("id", "00000000-0000-0000-0000-000000000000").select();
    expect(writeErr === null).toBe(true); // RLS: update silently affects 0 rows
    const { data: featured } = await service.from("jobs").select("id").eq("is_featured", true);
    expect(featured).toEqual([]);
  });

  it("admin stats, expiry and alerts RPCs work for the service role", async () => {
    const { data: stats, error } = await service.rpc("admin_job_stats");
    expect(error).toBeNull();
    expect(stats.active).toBeGreaterThan(50);
    expect(stats.duplicates).toBeGreaterThanOrEqual(3);
    expect(stats.flagged).toBeGreaterThanOrEqual(1);
    expect(stats.sources.find((s: { slug: string }) => s.slug === "remoteok").last_jobs_fetched).toBeGreaterThan(20);

    // An alert for India-eligible remote AI jobs, then a fresh job arriving.
    const { data: user } = await service.from("profiles").select("id").limit(1).maybeSingle();
    expect(user).toBeNull(); // no users yet; create one through the auth stub
    const exp = await service.rpc("expire_jobs");
    expect(exp.error).toBeNull();
    expect(exp.data).toHaveProperty("expired");
    const alerts = await service.rpc("process_job_alerts");
    expect(alerts.error).toBeNull();
  });

  it("alerts notify users of new matching jobs; saved jobs are private per user", async () => {
    const pg = (await import("node:child_process")).execSync;
    const uid = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    pg(`psql -h /tmp -p 54329 -U postgres -d mk -q -c "insert into auth.users (id, email) values ('${uid}','a@example.com'), ('${other}','b@example.com') on conflict do nothing"`);
    const userA = createClient(url, jwt({ role: "authenticated", sub: uid }), { auth: { persistSession: false } });
    const userB = createClient(url, jwt({ role: "authenticated", sub: other }), { auth: { persistSession: false } });

    const alert = await userA.from("job_alerts").insert({ user_id: uid, name: "India AI remote", ai_only: true, remote_only: true, india_mode: "eligible", last_checked_at: "2000-01-01" }).select().single();
    expect(alert.error).toBeNull();
    const n = await service.rpc("process_job_alerts");
    expect(n.data).toBeGreaterThan(0);
    const { data: notes } = await userA.from("job_notifications").select("title,url");
    expect(notes!.length).toBeGreaterThan(0);
    const { data: notesB } = await userB.from("job_notifications").select("id");
    expect(notesB).toEqual([]);
    // Second run: nothing new
    expect((await service.rpc("process_job_alerts")).data).toBe(0);

    const job = (await search({ p_limit: 1 })).items[0];
    expect((await userA.from("saved_jobs").insert({ user_id: uid, job_id: job.id })).error).toBeNull();
    expect((await userB.from("saved_jobs").select("job_id")).data).toEqual([]);
    expect((await userB.from("saved_jobs").insert({ user_id: uid, job_id: job.id })).error).toBeTruthy();
    const { data: profile } = await userA.from("profiles").select("role").single();
    expect(profile!.role).toBe("user");
    expect((await userA.from("profiles").update({ role: "admin" }).eq("id", uid)).error).toBeTruthy();
  });

  it("section counts power the homepage tabs", async () => {
    const { data, error } = await anon.rpc("job_section_counts");
    expect(error).toBeNull();
    expect(data.remote).toBeGreaterThanOrEqual(50);
    expect(data.india).toBeGreaterThan(10);
  });
});
