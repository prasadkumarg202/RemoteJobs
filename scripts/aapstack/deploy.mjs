#!/usr/bin/env node
// Deploys Mana Kosamu Jobs to an AapStack (OwnDatabase) project, using AapStack's control API.
// Safe to re-run: applied migrations are skipped (checksums), functions get a new version, cron jobs are updated.
//
//   node scripts/aapstack/deploy.mjs                 everything
//   node scripts/aapstack/deploy.mjs --only=migrations,functions,secrets,cron,extensions
//   node scripts/aapstack/deploy.mjs --dry-run       migrations are tried and rolled back; nothing else changes
//
// Reads .env.local, then the environment:
//   ODB_TOKEN                   personal access token (AapStack dashboard → Access tokens, or `odb tokens create deploy`)
//   ODB_URL                     default https://aapstack.tech
//   ODB_PROJECT_ID              default: taken from NEXT_PUBLIC_SUPABASE_URL (…/p/<project id>)
//   SUPABASE_SERVICE_ROLE_KEY   stored as a function secret so the sync functions can write jobs
//   STARTUP_JOBS_API_KEY, ADZUNA_APP_ID, ADZUNA_APP_KEY, FREELANCER_OAUTH_TOKEN, JOOBLE_API_KEY   optional source keys
//   VOYAGE_API_KEY or OPENAI_API_KEY (+ EMBEDDINGS_PROVIDER, EMBEDDINGS_MODEL)   smart search + jobs assistant
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? true]));
const only = args.only ? new Set(String(args.only).split(",")) : null;
const step = (name) => !only || only.has(name);
const DRY = !!args["dry-run"];

// .env.local (simple KEY=VALUE parser; the environment wins)
const env = { ...process.env };
if (existsSync(`${root}.env.local`)) {
  for (const line of readFileSync(`${root}.env.local`, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const BASE = (env.ODB_URL ?? "https://aapstack.tech").replace(/\/$/, "");
const PROJECT = env.ODB_PROJECT_ID ?? (env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/\/p\/([0-9a-f-]{36})/i)?.[1];
const TOKEN = env.ODB_TOKEN;
if (!TOKEN) die("Set ODB_TOKEN (a personal access token from the AapStack dashboard → Access tokens).");
if (!PROJECT) die("Set ODB_PROJECT_ID, or NEXT_PUBLIC_SUPABASE_URL=https://aapstack.tech/p/<project id> in .env.local.");

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) { const e = new Error(`${method} ${path} → ${res.status}: ${json.message ?? json.error ?? text.slice(0, 300)}`); e.status = res.status; throw e; }
  return json;
}

console.log(`AapStack ${BASE}  project ${PROJECT}${DRY ? "  (dry run)" : ""}`);

// 1. Extensions (live in public on AapStack). Also in a dry run: the migrations need them, and enabling is harmless.
if (step("extensions")) {
  for (const name of ["pg_trgm", "unaccent", "vector"]) {
    try { await api("POST", `/api/projects/${PROJECT}/extensions`, { name }); console.log(`✓ extension ${name}`); }
    catch (e) { console.log(`! extension ${name}: ${e.message} (enable it in Dashboard → Database → Extensions)`); }
  }
}

// 2. Migrations (aapstack/migrations, generated from supabase/migrations)
if (step("migrations")) {
  const dir = `${root}aapstack/migrations/`;
  const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  for (const f of files) {
    const [, version, name] = f.match(/^(\d+)_(.+)\.sql$/);
    const sql = readFileSync(dir + f, "utf8").replace(/\r\n/g, "\n");
    try {
      const r = await api("POST", `/api/projects/${PROJECT}/migrations`, { version, name, sql, dry_run: DRY });
      console.log(`✓ migration ${f}: ${r.status}${r.dry_run ? " (dry run)" : ""}`);
      if (DRY && r.status !== "already_applied") { console.log("  (dry run stops at the first pending migration: later ones depend on it)"); break; }
    } catch (e) { die(`migration ${f}: ${e.message}`); }
  }
}

// 3. Function secrets
if (step("secrets") && !DRY) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) console.log("! SUPABASE_SERVICE_ROLE_KEY not set: the sync functions can't write jobs until you add it as a function secret.");
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "STARTUP_JOBS_API_KEY", "ADZUNA_APP_ID", "ADZUNA_APP_KEY", "FREELANCER_OAUTH_TOKEN", "JOOBLE_API_KEY", "VOYAGE_API_KEY", "OPENAI_API_KEY", "EMBEDDINGS_PROVIDER", "EMBEDDINGS_MODEL"]) {
    if (!env[name]) continue;
    await api("POST", "/api/secrets", { project_id: PROJECT, name, value: env[name] });
    console.log(`✓ secret ${name}`);
  }
}

// 4. Functions (aapstack/functions/sync-*.mjs, built by scripts/aapstack/build-functions.ts)
if (step("functions") && !DRY) {
  const dir = `${root}aapstack/functions/`;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^(sync-[a-z]+|embed-jobs)\.mjs$/.test(f)).sort() : [];
  if (!files.length) die("No bundles in aapstack/functions — run: npx tsx scripts/aapstack/build-functions.ts");
  for (const f of files) {
    const slug = f.replace(/\.mjs$/, "");
    const r = await api("POST", `/api/projects/${PROJECT}/functions`, { slug, name: slug, code: readFileSync(dir + f, "utf8"), timeout_ms: 60000, memory_mb: 256, verify_jwt: true });
    console.log(`✓ function ${slug} v${r.version}`);
  }
}

// 5. Cron jobs (UTC) — same schedule as supabase/cron.sql
if (step("cron") && !DRY) {
  const fn = (slug) => ({ job_type: "function.invoke", payload: { slug: `sync-${slug}`, body: {} } });
  const sqlJob = (query) => ({ job_type: "sql.run", payload: { query } });
  const jobs = [
    ["jobs-sync-himalayas", "17 1 * * *", fn("himalayas")],
    ["jobs-sync-jobicy", "23 */6 * * *", fn("jobicy")],
    ["jobs-sync-remoteok", "41 */6 * * *", fn("remoteok")],
    ["jobs-sync-startupjobs", "7 */12 * * *", fn("startupjobs")],
    ["jobs-sync-remotive", "53 */6 * * *", fn("remotive")],
    ["jobs-sync-adzuna", "11 2,14 * * *", fn("adzuna")],
    ["jobs-sync-freelancer", "29 */6 * * *", fn("freelancer")],
    ["jobs-sync-workingnomads", "47 3,15 * * *", fn("workingnomads")],
    ["jobs-sync-arbeitnow", "59 4,16 * * *", fn("arbeitnow")],
    ["jobs-sync-greenhouse", "13 5,17 * * *", fn("greenhouse")],
    ["jobs-sync-lever", "37 5,17 * * *", fn("lever")],
    ["jobs-sync-ashby", "49 5,17 * * *", fn("ashby")],
    ["jobs-sync-weworkremotely", "5 */6 * * *", fn("weworkremotely")],
    ["jobs-sync-jooble", "19 1,13 * * *", fn("jooble")],
    ["jobs-embed", "21,51 * * * *", { job_type: "function.invoke", payload: { slug: "embed-jobs", body: {} } }],
    ["jobs-expire", "35 */3 * * *", sqlJob("select expire_jobs()")],
    ["jobs-alerts", "52 * * * *", sqlJob("select process_job_alerts()")],
    ["jobs-events-retention", "15 3 * * 0", sqlJob("delete from job_events where created_at < now() - interval '180 days'")],
  ];
  const existing = new Map(((await api("GET", `/api/projects/${PROJECT}/cron`)).data ?? []).map((c) => [c.name, c]));
  for (const [name, schedule, job] of jobs) {
    const body = { name, schedule, ...job, is_enabled: true };
    const cur = existing.get(name);
    if (cur) await api("PATCH", `/api/projects/${PROJECT}/cron/${cur.id}`, body);
    else await api("POST", `/api/projects/${PROJECT}/cron`, body);
    console.log(`✓ cron ${name} (${schedule} UTC)`);
  }
}

console.log(DRY ? "Dry run finished." : "Done. Next: Dashboard → Authentication → Phone (SMS) settings, then npm run build.");
