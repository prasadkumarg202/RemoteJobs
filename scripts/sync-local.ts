// Run a source sync from your machine against your Supabase project (same code as the Edge Functions).
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/sync-local.ts jobicy [--force]
//   npx tsx scripts/sync-local.ts --fixtures      # load the bundled test fixtures instead of calling sources (dev only)
import { createClient } from "@supabase/supabase-js";
import { getAdapter, runSync, SupabaseJobRepository, type FetchLike } from "../supabase/functions/_shared/engine/index.ts";
import { readFileSync } from "node:fs";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side only, never commit it).");
  process.exit(1);
}

const args = process.argv.slice(2);
const useFixtures = args.includes("--fixtures");
const force = args.includes("--force") || useFixtures;
const slugs = args.filter((a) => !a.startsWith("--"));
const targets = slugs.length ? slugs : ["himalayas", "jobicy", "remoteok", "remotive", "adzuna", "freelancer", "workingnomads", "arbeitnow"];

const fx = (n: string) => readFileSync(new URL(`../tests/fixtures/${n}`, import.meta.url), "utf8");
const fixtureFetch: FetchLike = async (input) => {
  const u = new URL(input);
  const body =
    u.hostname.includes("himalayas") ? fx("himalayas.json")
    : u.hostname.includes("jobicy") ? (u.searchParams.get("get") === "industries" ? fx("jobicy-taxonomy-industries.json") : u.searchParams.get("get") === "locations" ? fx("jobicy-taxonomy-locations.json") : fx("jobicy.json"))
    : u.hostname.includes("remoteok") ? fx("remoteok.json")
    : u.hostname.includes("remotive") ? fx("remotive.json")
    : u.hostname.includes("adzuna") ? fx("adzuna-in.json")
    : u.hostname.includes("freelancer") ? fx("freelancer.json")
    : u.hostname.includes("workingnomads") ? fx("workingnomads.json")
    : u.hostname.includes("arbeitnow") ? fx("arbeitnow.json") : "{}";
  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
};

const db = createClient(url, key, { auth: { persistSession: false } });
const repo = new SupabaseJobRepository(db);
for (const slug of targets) {
    const secrets = useFixtures
    ? { ADZUNA_APP_ID: "fixture", ADZUNA_APP_KEY: "fixture", FREELANCER_OAUTH_TOKEN: "fixture" }
    : { STARTUP_JOBS_API_KEY: process.env.STARTUP_JOBS_API_KEY, ADZUNA_APP_ID: process.env.ADZUNA_APP_ID, ADZUNA_APP_KEY: process.env.ADZUNA_APP_KEY, FREELANCER_OAUTH_TOKEN: process.env.FREELANCER_OAUTH_TOKEN };
  const r = await runSync(getAdapter(slug), repo, { force, fetchImpl: useFixtures ? fixtureFetch : undefined, pageDelayMs: useFixtures ? 0 : undefined, secrets });
  console.log(`${slug}: found ${r.jobs_found}, added ${r.jobs_added}, updated ${r.jobs_updated}, duplicates ${r.jobs_duplicates}, skipped ${r.jobs_skipped}, expired ${r.jobs_expired}${r.skipped_reason ? ` (skipped: ${r.skipped_reason})` : ""}`);
  for (const e of r.errors) console.log(`  ! ${e}`);
}
