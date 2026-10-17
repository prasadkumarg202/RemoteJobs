#!/usr/bin/env node
// Live check of the AapStack deployment (run from a machine that can reach AapStack).
//   node scripts/aapstack/smoke.mjs            checks + runs the enabled job syncs once (loads the first jobs)
//   node scripts/aapstack/smoke.mjs --no-sync  checks only
//   --force   run the syncs even if their minimum interval hasn't passed (first load)
//   --jobicy  also test which Jobicy API requests are accepted
// Optional end-to-end sign-in with an AapStack test number (Auth → Phone → Test numbers):
//   AAP_TEST_PHONE=+919999999999 AAP_TEST_OTP=123456 node scripts/aapstack/smoke.mjs
// Never prints keys.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const env = { ...process.env };
if (existsSync(`${root}.env.local`)) for (const line of readFileSync(`${root}.env.local`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT = URL_?.match(/\/p\/([0-9a-f-]{36})/i)?.[1];
const BASE = (env.ODB_URL ?? "https://aapstack.tech").replace(/\/$/, "");
const results = [];
const ok = (name, detail = "") => { results.push(["PASS", name, detail]); console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`); };
const bad = (name, detail = "") => { results.push(["FAIL", name, detail]); console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`); };
const warn = (name, detail = "") => { results.push(["WARN", name, detail]); console.log(`WARN  ${name}${detail ? ` — ${detail}` : ""}`); };
const step = async (name, fn) => { try { await fn(); } catch (e) { bad(name, e.message?.slice(0, 300)); } };
const sync = !process.argv.includes("--no-sync");

console.log(`AapStack project ${PROJECT}  (${new Date().toISOString()})\n`);
if (!URL_ || !ANON || !SVC || !PROJECT) { bad("env", "NEXT_PUBLIC_SUPABASE_URL (…/p/<id>), NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required in .env.local"); process.exit(1); }
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
const svc = createClient(URL_, SVC, { auth: { persistSession: false } });

await step("anon key works (job sources are public)", async () => {
  const { data, error } = await anon.from("job_sources").select("slug,enabled").order("slug");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("no rows");
  ok("anon key works (job sources are public)", `${data.length} sources, enabled: ${data.filter((s) => s.enabled).map((s) => s.slug).join(", ")}`);
});
await step("plans readable", async () => {
  const { data, error } = await anon.from("subscription_plans").select("id,price_inr,razorpay_plan_id").order("sort_order");
  if (error) throw new Error(error.message);
  ok("plans readable", data.map((p) => `${p.id} ₹${p.price_inr}${p.razorpay_plan_id ? "" : " (no Razorpay id yet)"}`).join(", "));
});
await step("access settings", async () => {
  const { data, error } = await anon.from("app_settings").select("value").eq("key", "access").single();
  if (error) throw new Error(error.message);
  ok("access settings", JSON.stringify(data.value));
});
await step("subscription lock: anonymous visitors can't read jobs", async () => {
  const { data, error } = await anon.rpc("search_jobs", { p_limit: 1 });
  if (error) throw new Error(error.message);
  const { data: rows, error: e2 } = await anon.from("jobs").select("id").limit(1);
  if (e2) throw new Error(e2.message);
  if (data.total === 0 && rows.length === 0) ok("subscription lock: anonymous visitors can't read jobs");
  else bad("subscription lock: anonymous visitors can't read jobs", `anon sees ${data.total} jobs`);
});
await step("anon can't call private functions", async () => {
  const r = await anon.rpc("access_until", { p_user: randomUUID() });
  r.error ? ok("anon can't call private functions") : bad("anon can't call private functions", "access_until is callable by anon");
});
await step("service key reaches admin RPCs", async () => {
  const { data, error } = await svc.rpc("admin_job_stats");
  if (error) throw new Error(error.message);
  ok("service key reaches admin RPCs", `jobs total ${data.total}, active ${data.active}`);
});
await step("phone sign-in enabled", async () => {
  const r = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: ANON } });
  const s = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(s).slice(0, 200)}`);
  s.external?.phone ? ok("phone sign-in enabled") : warn("phone sign-in enabled", "OFF — enable it in AapStack → Authentication → Settings → Phone (SMS)");
});

if (sync) {
  const { data: srcs } = await svc.from("job_sources").select("slug,enabled").eq("enabled", true);
  for (const { slug } of srcs ?? []) {
    if (["employer", "manual"].includes(slug)) continue;
    await step(`sync-${slug}`, async () => {
      const t = Date.now();
      const r = await fetch(`${URL_}/functions/v1/sync-${slug}${process.argv.includes("--force") ? "?force=1" : ""}`, { method: "POST", headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "content-type": "application/json" }, body: JSON.stringify({ force: process.argv.includes("--force") }) });
      const text = await r.text();
      let b; try { b = JSON.parse(text); } catch { b = { raw: text.slice(0, 300) }; }
      const secs = ((Date.now() - t) / 1000).toFixed(1);
      if (!r.ok) return bad(`sync-${slug}`, `HTTP ${r.status} in ${secs}s: ${(b.error ?? b.message ?? b.raw ?? text).toString().slice(0, 300)}`);
      if (b.skipped_reason) return warn(`sync-${slug}`, `skipped: ${b.skipped_reason}`);
      const errs = (b.errors ?? []).filter((e) => !/were skipped|Invalid job/.test(e));
      (errs.length ? warn : ok)(`sync-${slug}`, `${secs}s: found ${b.jobs_found}, added ${b.jobs_added}, updated ${b.jobs_updated}, duplicates ${b.jobs_duplicates}${errs.length ? `; ${errs.slice(0, 2).join(" | ").slice(0, 200)}` : ""}`);
    });
  }
  await step("jobs in database after sync", async () => {
    const { data, error } = await svc.rpc("job_section_counts");
    if (error) throw new Error(error.message);
    ok("jobs in database after sync", JSON.stringify(data));
  });
  await step("smart search vectors", async () => {
    const { count, error } = await svc.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true).not("embedding_hash", "is", null);
    if (error) throw new Error(error.message);
    const hasKey = env.VOYAGE_API_KEY || env.OPENAI_API_KEY;
    (count || !hasKey ? ok : warn)("smart search vectors", hasKey ? `${count} active jobs have vectors${count ? "" : " — embed-jobs runs every 30 min; or run it from AapStack → Functions"}` : "off (no VOYAGE_API_KEY / OPENAI_API_KEY)");
  });
  await step("filtered search (list arguments)", async () => {
    // The app sends list arguments as Postgres array literals (engine/compat-fetch.ts) — check that form works live.
    const { data, error } = await svc.rpc("search_jobs", { p_sections: '{"remote"}', p_limit: 1 });
    if (error) throw new Error(error.message);
    ok("filtered search (list arguments)", `remote section: ${data.total} jobs`);
  });
}

if (process.argv.includes("--jobicy")) {
  // Which Jobicy API requests does the API accept today? (It answered HTTP 400 on the first live run.)
  for (const q of ["count=100", "count=50", "count=50&tag=ai", "count=50&geo=apac", "count=20&geo=apac", "get=locations", "get=industries"]) {
    try {
      const r = await fetch(`https://jobicy.com/api/v2/remote-jobs?${q}`, { headers: { "user-agent": "ManaKosamuJobs/1.0 (+https://manakosamu.com)", accept: "application/json" } });
      const t = await r.text();
      let info; try { const j = JSON.parse(t); info = Array.isArray(j.jobs) ? `${j.jobs.length} jobs` : JSON.stringify(j).slice(0, 160); } catch { info = t.slice(0, 160).replace(/\s+/g, " "); }
      console.log(`JOBICY ${q} → ${r.status} ${info}`);
    } catch (e) { console.log(`JOBICY ${q} → error ${e.message}`); }
  }
}

if (env.ODB_TOKEN) {
  const api = async (method, path, body) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${env.ODB_TOKEN}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${r.status} ${j.message ?? ""}`); return j;
  };
  await step("cron: scheduled SQL job runs", async () => {
    const crons = (await api("GET", `/api/projects/${PROJECT}/cron`)).data ?? [];
    const c = crons.find((x) => x.name === "jobs-expire");
    if (!c) throw new Error("jobs-expire not found");
    const { job_id } = await api("POST", `/api/projects/${PROJECT}/cron/${c.id}/run`, {});
    let state = "waiting", job;
    for (let i = 0; i < 20 && !["completed", "failed"].includes(state); i++) {
      await new Promise((r) => setTimeout(r, 1500));
      job = await api("GET", `/api/projects/${PROJECT}/queues/jobs/${job_id}`); state = job.state;
    }
    state === "completed" ? ok("cron: scheduled SQL job runs", `jobs-expire → ${JSON.stringify(job.return_value)}`) : bad("cron: scheduled SQL job runs", `${state}: ${job?.failed_reason ?? ""}`);
    const enabled = crons.filter((x) => x.is_enabled).length;
    ok("cron: schedules", `${crons.length} jobs, ${enabled} enabled, next runs set: ${crons.filter((x) => x.next_run_at).length}`);
  });
}

if (env.AAP_TEST_PHONE && env.AAP_TEST_OTP) {
  await step("sign-in with test number → device → trial → jobs", async () => {
    const user = createClient(URL_, ANON, { auth: { persistSession: false } });
    const s1 = await user.auth.signInWithOtp({ phone: env.AAP_TEST_PHONE });
    if (s1.error) throw new Error(`send OTP: ${s1.error.message}`);
    const s2 = await user.auth.verifyOtp({ phone: env.AAP_TEST_PHONE, token: env.AAP_TEST_OTP, type: "sms" });
    if (s2.error) throw new Error(`verify OTP: ${s2.error.message}`);
    const dh = createHash("sha256").update(`mk-device:smoke-${env.AAP_TEST_PHONE}`).digest("hex");
    const b = await user.rpc("bind_device", { p_device_hash: dh, p_label: "Smoke test" });
    if (b.error) throw new Error(`bind_device: ${b.error.message}`);
    const r = await user.rpc("search_jobs", { p_limit: 1 });
    if (r.error) throw new Error(`search: ${r.error.message}`);
    ok("sign-in with test number → device → trial → jobs", `device ${b.data.device}, access until ${b.data.access_until}, sees ${r.data.total} jobs`);
  });
} else warn("sign-in end-to-end", "skipped (set AAP_TEST_PHONE and AAP_TEST_OTP to a test number from AapStack → Auth → Phone)");

const fails = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - fails} passed/warned, ${fails} failed`);
process.exit(fails ? 1 : 0);
