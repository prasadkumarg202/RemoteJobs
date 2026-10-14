# Job sources — terms, attribution and polling

Checked on **10 October 2026** (first four) and **14 October 2026** (the rest). Terms change: re-check each source before enabling it in production and record the date in `/admin/jobs` (the "Terms reviewed" checkbox sets `job_sources.terms_verified_at`).

| Source | Access | Polling we use | Must do | Must not do | Shipped |
|---|---|---|---|---|---|
| **Himalayas** | `GET https://himalayas.app/jobs/api` (no auth, max `limit=20`, cursor pagination); RSS `https://himalayas.app/jobs/rss` | Once a day (data refreshes daily); 1.5 s between pages; max 15 pages | Link to the Himalayas job URL; name Himalayas as the source | **Submit Himalayas jobs to third-party job sites (Google Jobs, LinkedIn, Jooble…)** → we never output JobPosting JSON-LD for them and keep aggregated job pages `noindex` | Enabled |
| **Jobicy** | `GET https://jobicy.com/api/v2/remote-jobs` (`count`, `geo`, `industry`, `tag`); taxonomy via `?get=industries` / `?get=locations`; RSS `https://jobicy.com/jobs/feed` | Every 6 h (Jobicy: never more than hourly); 2 s between queries; taxonomy cached 7 days | Keep Jobicy as the source and preserve the canonical job URL; sanitize `jobDescription` HTML; use taxonomy endpoints instead of hard-coded slugs | Present listings as our own; remove attribution; spam/misleading job databases | Enabled |
| **Remote OK** | `GET https://remoteok.com/api` (first item is a legal notice); RSS `https://remoteok.com/remote-jobs.rss`; `?tags=` filter | Every 6 h, conditional requests (ETag / If-Modified-Since) | Credit Remote OK and link back to every original job URL so candidates apply there | — | Enabled |
| **Startup Jobs** | No REST/RSS documented. MCP server (Streamable HTTP) `https://api.startup.jobs/mcp`, tool `search_jobs`; free tier 20 req/min, last 14 days; contact marc@startup.jobs for full access | Every 12 h, 3.5 s between calls | Attribution + link back (assumed; confirm) | — | **Disabled** until an admin confirms terms with Startup Jobs |
| **Remotive** | `GET https://remotive.com/api/remote-jobs` (no auth; `category`, `search`, `limit`) | Every 6 h, 1 request per run (Remotive: ~4/day max, >2/min blocked) | Link back to the Remotive job URL and name Remotive as the source | **Submit Remotive jobs to other boards/aggregators (Google Jobs, LinkedIn, Jooble…)**; use listings to collect signups/emails. Jobs arrive 24 h late. | Enabled |
| **Adzuna** (India) | `GET https://api.adzuna.com/v1/api/jobs/in/search/{page}` with `app_id` + `app_key` | Twice a day, ≤ 6 requests per run (limits: 25/min, 250/day, 1,000/week, 2,500/month) | Show an **"Adzuna" label (≥ 116×23 px) linked to Adzuna on every listing** (built in: `SourceBadge`; swap in their official logo); follow `redirect_url` to apply | **Commercial use beyond a 14-day trial without Adzuna's written consent/licence**; extracting data for commercial reuse | **Disabled** — needs keys + written consent |
| **Freelancer.com** | Official API `GET /api/projects/0.1/projects/active/` with OAuth token header `freelancer-oauth-v1` | Every 6 h, ≤ 7 requests per run | Link to the project on Freelancer.com; freelancers bid there | — (terms page couldn't be read here; confirm before enabling) | **Disabled** — needs token + terms check |
| **Working Nomads** | Public JSON feed `https://www.workingnomads.com/api/exposed_jobs/` | Twice a day, 1 request | Attribution + link back (assumed) | No published API terms found | **Disabled** — confirm with Working Nomads |
| **Arbeitnow** | Free API `https://www.arbeitnow.com/api/job-board-api` (no key, paged) | Twice a day, ≤ 3 pages | Attribution + link back (assumed) | Terms only in Postman docs, not readable here | **Disabled** — review terms (mostly European jobs) |
| **Upwork** | GraphQL API exists, but every key is reviewed, the job-posting scope is described "for enterprise user", and data may not be stored > 24 h | — | — | **Not scraped and not integrated.** Mana Kosamu is unlikely to qualify for republishing access. | Not built |
| **We Work Remotely** | API/RSS exist | — | — | Their API terms forbid using the data for a job search service | Not built |
| **Fiverr, PeoplePerHour, Guru, Truelancer, Internshala** | No public jobs API | — | — | Would require scraping | Not built — partnership or employer posting instead |

## Turning on a disabled source

1. Get what it needs: Adzuna keys + written consent; Freelancer.com OAuth token; for Working Nomads / Arbeitnow, read/confirm their terms.
2. Set secrets: `supabase secrets set ADZUNA_APP_ID=… ADZUNA_APP_KEY=… FREELANCER_OAUTH_TOKEN=…` (and the same in `.env.local` for `npm run sync`).
3. In `/admin/jobs`, tick **Terms reviewed** and click **Enable**. The cron schedule already includes every source; disabled ones are skipped without any network call.

## Adding an authorized freelance source later

`supabase/functions/_shared/engine/adapters/future-freelance.ts` is a template. Implement `fetchJobs()` against the official API, register it in `adapters/index.ts`, insert a `job_sources` row (`enabled = false`), add a 3-line `sync-<slug>` function. No schema change is needed — every source goes through the same `jobs` / `job_sources_mapping` tables.

## Things we never do

No scraping where an API/feed exists; no bypassing Cloudflare, CAPTCHA, robots rules, authentication, paywalls or rate limits. The HTTP client identifies itself (`ManaKosamuJobsBot/1.0`), stops on HTTP 429 instead of retrying aggressively, and the pipeline refuses to call a source again before its `min_interval_minutes`.
