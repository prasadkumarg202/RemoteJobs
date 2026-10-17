// End-to-end: real Postgres + PostgREST + supabase-js + migrations + RLS + RPCs.
// Runs only when INTEGRATION_PGRST=http://localhost:3011 (see tests/sql/setup-db.sh).
import { createHmac } from "node:crypto";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { compatFetch, EMBEDDING_DIMS, runEmbeddings, toVectorLiteral, GreenhouseAdapter, HimalayasAdapter, JobicyAdapter, normalizeJob, RemoteOkAdapter, runSync, SupabaseJobRepository } from "@engine";
import { govToRaw } from "@/lib/jobs/government";
import { FIXTURE_NOW, fakeFetch, fixtureJson, json, sourceFetch } from "./helpers.ts";

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
    // supabase-js asks for schema "public"; like AapStack's gateway, serve the configured (project) schema instead.
    const headersFor = (req: http.IncomingMessage) => {
      const headers: Record<string, string | string[] | undefined> = { ...req.headers, host: target.host };
      for (const h of ["accept-profile", "content-profile"]) if (headers[h] === "public") delete headers[h];
      return headers;
    };
    server = http.createServer((req, res) => {
      const path = (req.url ?? "/").replace(/^\/rest\/v1/, "");
      // Imitate AapStack's REST quirks so these tests catch them: quoted bulk-insert column names are
      // taken literally, and very long URLs are refused (seen on the live platform).
      if (process.env.INTEGRATION_DB === "aap") {
        const cols = new URL(path, "http://x").searchParams.get("columns");
        if (cols?.includes('"')) { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ message: `Column '${cols.split(",")[0]}' does not exist` })); return; }
        if (/\/rpc\//.test(path) && req.method === "POST") {
          // AapStack binds RPC arguments as text: a JSON array can't become text[]/uuid[].
          const chunks: Buffer[] = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => {
            const raw = Buffer.concat(chunks).toString();
            let body: Record<string, unknown> = {};
            try { body = JSON.parse(raw || "{}"); } catch { /* not json */ }
            const bad = Object.entries(body).find(([, v]) => Array.isArray(v));
            if (bad) { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ message: `malformed array literal: "${JSON.stringify(bad[1]).slice(0, 40)}"` })); return; }
            const p = http.request({ host: target.hostname, port: target.port, path, method: req.method, headers: { ...headersFor(req), "content-length": Buffer.byteLength(raw) } }, (r) => { res.writeHead(r.statusCode ?? 500, r.headers); r.pipe(res); });
            p.end(raw);
          });
          return;
        }
        if (path.length > 6000) { res.writeHead(431, { "content-type": "application/json" }); res.end(JSON.stringify({ message: "Exceeded maximum allowed HTTP header size" })); return; }
      }
      const p = http.request({ host: target.hostname, port: target.port, path, method: req.method, headers: headersFor(req) }, (r) => {
        res.writeHead(r.statusCode ?? 500, r.headers);
        r.pipe(res);
      });
      req.pipe(p);
    });
    await new Promise<void>((r) => server.listen(0, r));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    service = createClient(url, jwt({ role: "service_role" }), { auth: { persistSession: false }, global: { fetch: compatFetch } });
    anon = createClient(url, jwt({ role: "anon" }), { auth: { persistSession: false }, global: { fetch: compatFetch } });

    // Most tests read jobs anonymously: run them with the site in "open" mode; the access test switches it.
    await service.from("app_settings").update({ value: { mode: "open", trial_days: 3, device_change_cooldown_days: 30 } }).eq("key", "access");
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
    pg(`psql -h /tmp -p 54329 -U postgres -d ${process.env.INTEGRATION_DB ?? "mk"} -q -c "insert into auth.users (id, email) values ('${uid}','a@example.com'), ('${other}','b@example.com') on conflict do nothing"`);
    const userA = createClient(url, jwt({ role: "authenticated", sub: uid }), { auth: { persistSession: false }, global: { fetch: compatFetch } });
    const userB = createClient(url, jwt({ role: "authenticated", sub: other }), { auth: { persistSession: false }, global: { fetch: compatFetch } });

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
    // Supabase creates the profile with a trigger on auth.users; AapStack at first sign-in (bind_device). Either way it exists after sign-in.
    expect((await userA.rpc("bind_device", { p_device_hash: "c".repeat(64) })).error).toBeNull();
    const { data: profile } = await userA.from("profiles").select("role").single();
    expect(profile!.role).toBe("user");
    expect((await userA.from("profiles").update({ role: "admin" }).eq("id", uid)).error).toBeTruthy();
  });

  it("affiliate partners: hidden until enabled with a link; clicks are counted", async () => {
    expect((await anon.from("affiliate_partners").select("slug")).data).toEqual([]);
    const bad = await service.from("affiliate_partners").update({ url: "javascript:alert(1)" }).eq("slug", "fiverr");
    expect(bad.error).toBeTruthy();
    await service.from("affiliate_partners").update({ url: "https://go.fiverr.com/visit/?bta=1", enabled: true }).eq("slug", "fiverr");
    expect((await anon.from("affiliate_partners").select("slug,url")).data).toEqual([{ slug: "fiverr", url: "https://go.fiverr.com/visit/?bta=1" }]);
    await anon.from("affiliate_partners").update({ url: "https://evil.example/x" }).eq("slug", "fiverr");
    expect((await service.from("affiliate_partners").select("url").eq("slug", "fiverr").single()).data!.url).toBe("https://go.fiverr.com/visit/?bta=1");
    const ins = await service.from("job_events").insert([
      { event_type: "affiliate_click", section: "freelance", filters: { partner: "fiverr" } },
      { event_type: "affiliate_click", section: "post", filters: { partner: "fiverr" } },
    ]);
    expect(ins.error).toBeNull();
    expect((await service.from("job_events").insert({ event_type: "bogus" })).error).toBeTruthy();
    const clicks = await service.rpc("admin_affiliate_clicks", { p_days: 30 });
    expect(clicks.data).toEqual({ fiverr: { total: 2, by_placement: { freelance: 1, post: 1 } } });
    expect((await anon.rpc("admin_affiliate_clicks", { p_days: 30 })).error).toBeTruthy();
  });

  it("Greenhouse boards from job_sources.config sync into districts; district/state filters work", async () => {
    await service.from("job_sources").update({ config: { boards: [{ token: "acme", company: "Acme Software" }], location_filter: "india_or_remote", full_feed_min: 1 } }).eq("slug", "greenhouse");
    const f = fakeFetch({ "boards-api.greenhouse.io/v1/boards/acme/jobs": () => json(fixtureJson("greenhouse-acme.json")) });
    const r = await runSync(new GreenhouseAdapter(), new SupabaseJobRepository(service), { fetchImpl: f, now: FIXTURE_NOW, force: true, pageDelayMs: 0 });
    expect(r.jobs_added).toBe(2);
    const hyd = await search({ p_district: "hyderabad", p_limit: 10 });
    expect(hyd.items.map((j) => j.title)).toContain("Senior Machine Learning Engineer");
    expect(hyd.items[0].district).toBe("hyderabad");
    const ts = await search({ p_state: "Telangana", p_limit: 50 });
    expect(ts.items.every((j) => j.state === "Telangana")).toBe(true);
    expect((await search({ p_district: "guntur", p_limit: 5 })).total).toBe(0);
  });

  it("government notifications: national ones match state=all_india and never appear in Local", async () => {
    const { data: manual } = await service.from("job_sources").select("id").eq("slug", "manual").single();
    const mk = async (o: Record<string, unknown>) => {
      const { job } = await normalizeJob(govToRaw({ id: crypto.randomUUID(), orgSlug: "ssc", scope: "IN", postName: "Combined Graduate Level 2027", lastDate: "2099-12-31", notificationUrl: "https://ssc.gov.in/cgl.pdf", ...o } as never),
        { sourceId: manual!.id, sourceSlug: "manual", sourceName: "Mana Kosamu", rates: { INR: 1 }, trustedSource: true });
      const { error } = await service.from("jobs").insert({ ...job, risk_flags: [], risk_level: "low", is_active: true, moderation_status: "approved", is_verified: true });
      expect(error).toBeNull();
    };
    await mk({});
    await mk({ orgSlug: "appsc", scope: "AP", postName: "Group-II Services", notificationUrl: "https://psc.ap.gov.in/g2.pdf", district: null });
    const all = await search({ p_sections: ["government"], p_state: "all_india" });
    expect(all.items.map((j) => j.title)).toEqual(["Combined Graduate Level 2027 (SSC)"]);
    const ap = await search({ p_sections: ["government"], p_state: "Andhra Pradesh" });
    expect(ap.items.map((j) => j.title)).toEqual(["Group-II Services (APPSC)"]);
    expect((await search({ p_sections: ["local"], p_query: "Group-II" })).total).toBe(0);
  });

  it("subscription mode: only subscribers on their one registered device can read jobs", async () => {
    const pg = (await import("node:child_process")).execSync;
    const uid = "33333333-3333-4333-8333-333333333333";
    pg(`psql -h /tmp -p 54329 -U postgres -d ${process.env.INTEGRATION_DB ?? "mk"} -q -c "insert into auth.users (id, phone) values ('${uid}','919876543210') on conflict do nothing"`);
    const user = createClient(url, jwt({ role: "authenticated", sub: uid }), { auth: { persistSession: false }, global: { fetch: compatFetch } });
    const devA = "a".repeat(64), devB = "b".repeat(64);
    const setMode = (mode: string) => service.from("app_settings").update({ value: { mode, trial_days: 3, device_change_cooldown_days: 30 } }).eq("key", "access");
    const userSearch = async () => (await user.rpc("search_jobs", { p_limit: 1 })).data as { total: number };

    await setMode("subscription");
    try {
      expect((await search({ p_limit: 1 })).total).toBe(0); // anonymous
      expect((await anon.from("job_sources_mapping").select("job_id").limit(1)).data).toEqual([]);
      expect((await userSearch()).total).toBe(0); // signed in, no device/plan yet
      expect((await anon.rpc("access_until", { p_user: uid })).error).toBeTruthy();
      expect((await anon.rpc("bind_device", { p_device_hash: devA })).error).toBeTruthy();

      // First sign-in: device A registered and a 3-day trial starts.
      const bind = await user.rpc("bind_device", { p_device_hash: devA, p_label: "Chrome on Android" });
      expect(bind.error).toBeNull();
      expect(bind.data).toMatchObject({ device: "match", trial_used: true, device_label: "Chrome on Android" });
      expect(Date.parse(bind.data.access_until)).toBeGreaterThan(Date.now() + 2.9 * 86400000);
      expect((await userSearch()).total).toBeGreaterThan(0);

      // Device B: bind never takes over; status says "other".
      expect((await user.rpc("bind_device", { p_device_hash: devB })).data).toMatchObject({ device: "other" });
      expect((await user.rpc("access_status", { p_device_hash: devA })).data).toMatchObject({ device: "match" });
      // A second trial is impossible.
      await service.from("user_devices").delete().eq("user_id", uid);
      await user.rpc("bind_device", { p_device_hash: devA });
      expect((await service.from("subscriptions").select("id").eq("user_id", uid).eq("provider", "trial")).data).toHaveLength(1);

      // Self-service move to B works once, then the cooldown applies.
      expect((await user.rpc("move_device", { p_device_hash: devB, p_label: "Safari on iPhone/iPad" })).data).toMatchObject({ device: "match" });
      expect((await user.rpc("access_status", { p_device_hash: devA })).data).toMatchObject({ device: "other" });
      const again = await user.rpc("move_device", { p_device_hash: devA });
      expect(again.error?.message).toMatch(/device change allowed after/);

      // Users can't grant themselves access or read others' rows.
      expect((await user.from("subscriptions").insert({ user_id: uid, provider: "admin", status: "active", current_end: "2099-01-01" })).error).toBeTruthy();
      expect((await user.from("user_devices").update({ device_hash: devA }).eq("user_id", uid).select()).data).toEqual([]);
      expect((await anon.from("subscriptions").select("id")).data).toEqual([]);

      // Trial over → no access; a Razorpay webhook activating a plan restores it.
      await service.from("subscriptions").update({ current_end: new Date(Date.now() - 1000).toISOString() }).eq("user_id", uid);
      expect((await userSearch()).total).toBe(0);

      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = jwt({ role: "anon" });
      process.env.SUPABASE_SERVICE_ROLE_KEY = jwt({ role: "service_role" });
      process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test";
      const { POST } = await import("@/app/api/razorpay/webhook/route");
      const now = Math.floor(Date.now() / 1000);
      const hook = async (event: string, entity: Record<string, unknown>, id: string, secret = "whsec_test") => {
        const body = JSON.stringify({ entity: "event", event, payload: { subscription: { entity } } });
        const sig = createHmac("sha256", secret).update(body).digest("hex");
        return POST(new Request("http://x/api/razorpay/webhook", { method: "POST", body, headers: { "x-razorpay-signature": sig, "x-razorpay-event-id": id } }));
      };
      const ent = { id: "sub_T1", plan_id: "plan_none", status: "active", current_start: now, current_end: now + 30 * 86400, notes: { user_id: uid } };
      expect((await hook("subscription.activated", ent, "evt_1", "wrong")).status).toBe(400);
      expect((await hook("subscription.activated", ent, "evt_1")).status).toBe(200);
      expect((await userSearch()).total).toBeGreaterThan(0);
      expect(await (await hook("subscription.activated", ent, "evt_1")).json()).toMatchObject({ duplicate: true });
      // An older event arriving late doesn't shorten access.
      await hook("subscription.pending", { ...ent, status: "pending", current_end: now - 86400 }, "evt_2");
      const row = (await service.from("subscriptions").select("status,current_end").eq("provider_subscription_id", "sub_T1").single()).data!;
      expect(row.status).toBe("pending");
      expect(Date.parse(row.current_end)).toBeGreaterThan(Date.now());
      expect((await service.from("subscription_events").select("event,processed").order("id")).data).toEqual([
        { event: "subscription.activated", processed: true }, { event: "subscription.pending", processed: true },
      ]);
    } finally {
      await setMode("open");
    }
  });

  it("email + password accounts: profile gets the email, same device + trial rules", async () => {
    const pg = (await import("node:child_process")).execSync;
    const uid = "44444444-4444-4444-8444-444444444444";
    pg(`psql -h /tmp -p 54329 -U postgres -d ${process.env.INTEGRATION_DB ?? "mk"} -q -c "insert into auth.users (id, email, phone) values ('${uid}','Tester@Example.com','') on conflict do nothing"`);
    const user = createClient(url, jwt({ role: "authenticated", sub: uid }), { auth: { persistSession: false }, global: { fetch: compatFetch } });
    await service.from("app_settings").update({ value: { mode: "subscription", trial_days: 3, device_change_cooldown_days: 30, email_login: true } }).eq("key", "access");
    try {
      const bind = await user.rpc("bind_device", { p_device_hash: "c".repeat(64), p_label: "Chrome on Windows" });
      expect(bind.error).toBeNull();
      expect(bind.data).toMatchObject({ device: "match", trial_used: true });
      const { data: prof } = await service.from("profiles").select("email,phone").eq("id", uid).single();
      expect(prof).toEqual({ email: "tester@example.com", phone: null });
      expect((await user.rpc("bind_device", { p_device_hash: "d".repeat(64) })).data).toMatchObject({ device: "other" });
      expect((await service.from("profiles").select("id").ilike("email", "%tester@%")).data).toHaveLength(1);
    } finally {
      await service.from("app_settings").update({ value: { mode: "open", trial_days: 3, device_change_cooldown_days: 30 } }).eq("key", "access");
    }
  });

  it("smart search: embed-jobs fills vectors; a query vector finds jobs by meaning, filters still apply", async () => {
    // Fake embeddings API: a deterministic bag-of-words vector, so similar texts get similar vectors.
    const vec = (s: string) => {
      const v = new Array(EMBEDDING_DIMS).fill(0);
      for (const w of s.toLowerCase().match(/[a-z]{3,}/g) ?? []) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % EMBEDDING_DIMS] += 1; }
      const n = Math.hypot(...v) || 1;
      return v.map((x) => x / n);
    };
    let calls = 0;
    const fakeVoyage = (async (_u: string, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body)) as { input: string[]; output_dimension: number; input_type: string };
      expect([body.output_dimension, body.input_type]).toEqual([EMBEDDING_DIMS, "document"]);
      return new Response(JSON.stringify({ data: body.input.map((s, index) => ({ embedding: vec(s), index })) }), { status: 200 });
    }) as typeof fetch;
    const cfg = { provider: "voyage" as const, apiKey: "test", model: "voyage-4-lite" };

    const first = await runEmbeddings(service, cfg, { fetchImpl: fakeVoyage, batchSize: 50 });
    expect(first.error).toBeUndefined();
    expect(first.remaining).toBe(false);
    expect(first.embedded).toBeGreaterThan(20);
    expect((await runEmbeddings(service, cfg, { fetchImpl: fakeVoyage })).embedded).toBe(0); // nothing changed → nothing to do
    // Not callable by visitors.
    expect((await anon.rpc("jobs_needing_embedding", { p_limit: 1 })).error).toBeTruthy();

    // A job's own vector, with words that match nothing by keyword, finds that job first.
    const { data: target } = await service.from("jobs").select("id,title,embedding_hash,india_eligibility").eq("is_active", true).not("embedding_hash", "is", null).limit(1).single();
    const { data: text } = await service.rpc("jobs_needing_embedding", { p_limit: 1 }); // empty now
    expect(text).toEqual([]);
    const { data: row } = await service.from("jobs").select("title,company_name,description").eq("id", target!.id).single();
    const qv = toVectorLiteral(vec(`${row!.title} ${row!.company_name} ${row!.description}`));
    expect((await search({ p_query: "zzqx vvkw", p_limit: 5 })).total).toBe(0);
    const smart = await search({ p_query: "zzqx vvkw", p_embedding: qv, p_limit: 5 });
    expect(smart.total).toBeGreaterThan(0);
    expect(smart.items[0].id).toBe(target!.id);
    // Filters still apply on top of meaning.
    const other = target!.india_eligibility === "not_eligible" ? "eligible" : "not_eligible";
    if (other === "not_eligible") {
      for (const j of (await search({ p_query: "zzqx vvkw", p_embedding: qv, p_india_mode: "eligible", p_limit: 50 })).items) expect(j.india_eligibility).not.toBe("not_eligible");
    }
    // A malformed vector is ignored (plain keyword search).
    expect((await search({ p_query: "zzqx vvkw", p_embedding: "[1,2,oops]" })).total).toBe(0);
    expect(calls).toBeGreaterThan(0);
  });

  it("assistant quota: N questions per day per user, then no", async () => {
    const pg = (await import("node:child_process")).execSync;
    const uid = "55555555-5555-4555-8555-555555555555";
    pg(`psql -h /tmp -p 54329 -U postgres -d ${process.env.INTEGRATION_DB ?? "mk"} -q -c "insert into auth.users (id, email) values ('${uid}','q@example.com') on conflict do nothing"`);
    const user = createClient(url, jwt({ role: "authenticated", sub: uid }), { auth: { persistSession: false }, global: { fetch: compatFetch } });
    await service.from("app_settings").upsert({ key: "ai", value: { assistant: true, daily_questions: 2, min_similarity: 0.4 } });
    try {
      expect((await user.rpc("take_ai_quota")).data).toMatchObject({ allowed: true, used: 1, limit: 2 });
      expect((await user.rpc("take_ai_quota")).data).toMatchObject({ allowed: true, used: 2 });
      expect((await user.rpc("take_ai_quota")).data).toMatchObject({ allowed: false });
      expect((await anon.rpc("take_ai_quota")).error).toBeTruthy();
      expect((await user.from("ai_usage").update({ questions: 0 }).eq("user_id", uid).select()).data ?? []).toEqual([]); // can't reset own count
    } finally {
      await service.from("app_settings").upsert({ key: "ai", value: { assistant: true, daily_questions: 20, min_similarity: 0.4 } });
    }
  });

  it("section counts power the homepage tabs", async () => {
    const { data, error } = await anon.rpc("job_section_counts");
    expect(error).toBeNull();
    expect(data.remote).toBeGreaterThanOrEqual(50);
    expect(data.india).toBeGreaterThan(10);
  });
});
