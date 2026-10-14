# Delivery report — Mana Kosamu Remote + AI + Freelance Job Engine

Built 10 October 2026.

## 0. Audit result & what this repository is

The spec asks to extend an existing Mana Kosamu repository. **No such repository was available**: `D:\websites\RemoteJobs` was empty and none of the GitHub repositories on the account is the Mana Kosamu app. So this is a **self-contained jobs module** built to drop into the existing app:

- The **database migrations are additive and idempotent**: `create … if not exists` and `alter table … add column if not exists`, so they extend an existing `jobs` or `profiles` table without replacing it. Constraints and policies are added only when missing.
- The **ingestion engine** (`supabase/functions/_shared/engine`) has no dependencies and runs unchanged in Supabase Edge Functions, Next.js and Vitest.
- **UI** uses plain Tailwind tokens defined in `app/globals.css`. When merging, map these tokens to the existing design system, and replace `Header`, `BottomNav` and `LoginForm` with the app's own navigation and auth components.

Before merging into the real app, check for: an existing `jobs` table with different column types, an existing `profiles.role` vocabulary, and an existing `on_auth_user_created` trigger. Ours is named `mk_jobs_on_auth_user_created` and uses `on conflict do nothing`.

## 1. Files

151 files. The main groups:

| Area | Files |
|---|---|
| Engine (shared) | `supabase/functions/_shared/engine/{types,text,taxonomy,classify,geo,eligibility,salary,risk,normalize,dedupe,repository,pipeline,http,rss,index}.ts` |
| Source adapters | `…/engine/adapters/{base,himalayas,jobicy,remoteok,startupjobs,employer,future-freelance,index}.ts` |
| Edge Functions | `supabase/functions/{sync-himalayas,sync-jobicy,sync-remoteok,sync-startupjobs,expire-jobs}/index.ts`, `_shared/serve-sync.ts`, `deno.json`, `supabase/config.toml` |
| Database | `supabase/migrations/20261010000001_job_engine_schema.sql`, `…02_job_engine_functions_rls.sql`, `…03_job_engine_seed.sql`, `supabase/cron.sql` |
| Pages | `app/jobs/{page, [slug], search, remote, remote/india, ai, ai/remote, ai/india, freelance, work-from-home, government, local, saved, alerts, post, employer/[id]}`, `app/{login, profile, terms, privacy, not-found, sitemap, robots}` |
| Admin | `app/admin/jobs/{page, moderation/page, actions}.ts(x)` |
| API | `app/go/[id]` (apply redirect), `app/api/events`, `app/api/jobs/{report, cards, [id]/telugu-summary}`, `app/auth/callback` |
| Components | `JobCard, GigCard, EligibilityBadge, FilterPanel (bottom sheet + sidebar), IndiaToggle, SearchBar, SectionTabs, SectionPage, Shelf, JobActions (share/report/hide), SaveButton, TeluguSummary, AlertForm, PostJobForm, LoginForm, BottomNav, Header, LangToggle, CityPicker, …` |
| Lib | `lib/jobs/{data,demo,filters,format,pages,route,types,events,sanitize,admin-data}.ts`, `lib/i18n.ts` (EN + Telugu), `lib/supabase/{server,browser,admin}.ts`, `middleware.ts` |
| Tests | `tests/{classify,pipeline,frontend,integration}.test.ts`, `tests/fixtures/*`, `tests/sql/*` |
| Scripts | `scripts/{sync-local,make-fixtures,build-demo-data,generate-seed-sql}.ts` |

## 2. Database migrations

**`…01_job_engine_schema.sql`**
- **`jobs`**: every field in the spec, plus:
  - `slug`, `apply_url`, `description_html`, `location_text`, `eligibility_type`, `india_eligibility`, `salary_inr_annual_max` (used for filtering)
  - `budget_type/min/max/currency/period`, `seniority`, `sections[]`
  - `moderation_status/note/by/at`, `risk_score/level/flags[]`
  - `normalized_title/company/location`, `content_hash`, `payload_hash`, `source_count`
  - `application_method`, `apply_email`, `apply_whatsapp`, `submitted_by`, `search_vector`
  - Check constraints on every enum.
- **Indexes:** GIN on `search_vector`, `sections`, `keywords`, `eligible_countries`; trigram on `title`; btree on the dedupe keys; partial indexes on active jobs.
- **Trigger** maintains the weighted `search_vector`: title A, company/skills/keywords/category B, description C, using both the English and `simple` configs so `n8n` and `c#` stay searchable.
- **`job_sources`**: the spec fields plus `slug`, `allow_structured_data`, `min_interval_minutes`, `retention_days`, `full_feed`, `terms_verified_at`, `terms_notes`, `config`, `http_cache`, and `last_*` health columns.
- **`job_sources_mapping`**: links job, source, external job id and URL; `is_primary`; first/last seen. Unique on (source, external id). A trigger keeps `jobs.source_count` current.
- **Other new tables:**
  - `job_categories` (EN + Telugu names, 4 groups and 54 categories)
  - `exchange_rates`
  - `job_sync_logs` (spec fields plus duplicates, flagged, fallback, kind)
  - `saved_jobs`, `hidden_jobs`, `job_reports`, `job_alerts`, `job_notifications` (in-app)
  - `job_events` (analytics, no PII)
  - `job_submission_contacts` (employer phone numbers, kept apart from the public row)
  - `job_ai_summaries`
- **`profiles`** gets `role`, `phone`, `preferred_language` and `home_city` added if missing.

**`…02_job_engine_functions_rls.sql`**
- **Search and listing:** `search_jobs(…)` (full-text search plus 20 filters and pagination), `job_section_counts()`, `india_mode_match()`.
- **Maintenance:** `deactivate_missing_jobs()`, `expire_jobs()`, `process_job_alerts()`. Execute permission on these is revoked from anon and authenticated users.
- **Admin:** `admin_job_stats()` and `admin_job_analytics()`, callable only by admins or the service role.
- **RLS** on every table:
  - The public sees only active, approved jobs.
  - Users see only their own saved jobs, hidden jobs, alerts and notifications.
  - Only admins read logs, events and reports.
  - Users cannot raise their own role.

**`…03_job_engine_seed.sql`** (generated from the engine taxonomy): sources, approximate exchange rates, categories.

## 3. Edge Functions

| Function | What it does |
|---|---|
| `sync-himalayas` / `sync-jobicy` / `sync-remoteok` / `sync-startupjobs` / `sync-remotive` / `sync-adzuna` / `sync-freelancer` / `sync-workingnomads` / `sync-arbeitnow` | Runs the pipeline for one source (see below) |
| `expire-jobs` | Runs `expire_jobs()` then `process_job_alerts()` |

The pipeline: fetch → validate → parse → normalize → classify → AI score → content hash → dedupe → upsert → log.

- **Auth:** `x-cron-secret` header or the service-role bearer token, with `verify_jwt = false`. Disabled sources and runs inside `min_interval_minutes` are skipped without any network call.
- **Wall time:** a Himalayas sync is about 15 requests with 1.5 s gaps, roughly 30 s, well under the Edge limit.

## 4. API / RSS integrations

| Source | Primary | Fallback | Notes |
|---|---|---|---|
| Himalayas | JSON browse API, cursor pagination, `limit=20` | RSS | "No location restriction and no timezone restriction" maps to worldwide. Expiry comes from `expiryDate`. |
| Jobicy | API v2 with configurable queries (`count`/`geo`/`industry`/`tag`) | RSS | `geo`/`industry` are validated against the live taxonomy endpoints, cached 7 days. Unknown slugs are skipped with a warning. |
| Remote OK | JSON API, ETag / If-Modified-Since | RSS | Legal-notice row skipped. Treated as a full feed: jobs missing from a complete payload are deactivated, with a guard against truncated payloads. |
| Startup Jobs | MCP over Streamable HTTP | — | `initialize → tools/list → tools/call search_jobs`. Arguments are mapped onto the tool's live input schema. Parses SSE. **Disabled by default.** |
| Remotive *(added 14 Oct)* | JSON API, one request per run | — | Salary parsed from free text; job type mapped; full feed (missing jobs deactivated). **Enabled.** |
| Adzuna *(added 14 Oct)* | JSON search API for India, keyed | — | Local Indian jobs (city/state from `location.area`) feed the Local section; Adzuna's *predicted* salaries are hidden; "Jobs by Adzuna" badge on every listing. **Disabled** until keys + written consent. |
| Freelancer.com *(added 14 Oct)* | Official projects API, OAuth token | — | Fixed/hourly budgets, project duration, skills; closed projects skipped; worldwide unless flagged local. **Disabled** until token + terms check. |
| Working Nomads *(added 14 Oct)* | Public JSON feed | — | Timezone-only locations become timezone eligibility. **Disabled** pending terms. |
| Arbeitnow *(added 14 Oct)* | Free paged API | — | Remote-only by default; European locations never treated as worldwide. **Disabled** pending terms. |
| Employer | Post-a-Job form | — | Goes through the same normalize, classify and risk code. Always held for moderation. |
| Future freelance | Template only | — | Upwork is not scraped (see SOURCES.md). |

## 5. Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Next (public) | Client and SSR. If empty, the app runs in demo mode. |
| `NEXT_PUBLIC_SITE_URL` | Next | Canonical URLs, sitemap, share links |
| `SUPABASE_SERVICE_ROLE_KEY` | Next server only, scripts | Analytics inserts, reports, employer submissions |
| `CRON_SECRET` | Next server and Edge secret | Authenticates cron and admin "Run sync" calls to functions |
| `ANTHROPIC_API_KEY`, `AI_SUMMARY_MODEL` | Next server (optional) | "తెలుగులో అర్థం చేసుకోండి" summaries. Disabled when empty. |
| `STARTUP_JOBS_API_KEY` | Edge secret (optional) | Only after terms review |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Edge secret (optional) | Adzuna, once written consent is in place |
| `FREELANCER_OAUTH_TOKEN` | Edge secret (optional) | Freelancer.com |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions by Supabase automatically.

## 6. Supabase cron (`supabase/cron.sql`)

Uses pg_cron + pg_net with secrets in Vault. All times are UTC.

| Job | Schedule |
|---|---|
| Himalayas | Daily at 01:17 (06:47 IST) |
| Jobicy | Every 6 h at :23 |
| Remote OK | Every 6 h at :41 |
| Startup Jobs | Every 12 h; does nothing while disabled |
| Remotive | Every 6 h at :53 (1 request) |
| Adzuna | 02:11 and 14:11 (≤ 6 requests) |
| Freelancer.com | Every 6 h at :29 |
| Working Nomads / Arbeitnow | Twice a day |
| `expire_jobs()` | Every 3 h |
| `process_job_alerts()` | Hourly |
| Delete analytics events older than 180 days | Weekly |

No source is polled more often than its published guidance, and the pipeline enforces this independently through `min_interval_minutes`.

## 7. Admin dashboard (`/admin/jobs`, `/admin/jobs/moderation`)

**Dashboard (`/admin/jobs`)**
- **Totals:** total, active, remote, AI, freelance, India-eligible, added today, expired today, duplicates merged, flagged.
- **Source health per source:** status, last successful sync, last error, jobs fetched, jobs inserted, live jobs, the last 5 runs, Run sync, and Enable/Disable. Enabling requires ticking "Terms reviewed".
- **Analytics (30 days):** most searched, most viewed, most applied category, popular AI skills, searches by section (remote vs local).
- **Exchange-rate editor.**

**Moderation queue (`/admin/jobs/moderation`)**
- Pending jobs with plain-language risk flags and the employer contact, with approve, verify or reject.
- Open reports, with reviewed or dismiss.
- Live jobs showing "Needs verification", with take down.

Access requires `profiles.role` to be `admin` or `moderator`. Middleware redirects anonymous users to sign in.

## 8. Frontend routes

| Route | Page |
|---|---|
| `/jobs` | Home: hero search with example queries, tabs, and Trending / Latest AI / Remote / Remote for India / Freelance / Jobs near you shelves |
| `/jobs/remote`, `/jobs/remote/india` | Remote jobs |
| `/jobs/ai`, `/jobs/ai/remote`, `/jobs/ai/india` | AI jobs. `/jobs/ai` has subcategory chips and Remote / India / Entry-level / Freelance-AI shelves. |
| `/jobs/freelance` | Freelance gigs, with category chips and gig cards |
| `/jobs/work-from-home` | Work-from-home jobs |
| `/jobs/government` | Government jobs |
| `/jobs/local` | Local jobs |
| `/jobs/search?q=` | Search results |
| `/jobs/[slug]` | Job detail. Also serves 18 curated topic pages such as `/jobs/chatgpt`, `/jobs/n8n`, `/jobs/python`, `/jobs/sql`, `/jobs/azure`. |
| `/jobs/saved` | Saved jobs: account and device |
| `/jobs/alerts` | Job alerts |
| `/jobs/post` | Post a job |
| `/profile` | Language, links, in-app notifications |
| `/login` | Phone OTP or email link |
| `/go/[id]` | Apply redirect |

Mobile first:
- Bottom nav: Home, Jobs, AI Jobs, Saved, Profile.
- Sticky filter bar that opens a bottom sheet.
- Large touch targets (at least 44 px), a sticky Apply bar, and WhatsApp share.
- No horizontal overflow at 390 px (checked).

## 9. Search & filters

**PostgreSQL full-text search** with weighted tsvector, `websearch_to_tsquery` (english OR simple), and an ILIKE fallback on title and company. Typesense/Meilisearch weren't present, and PostgreSQL FTS is sufficient at this scale.

**Natural-language intent.** Query words become filters and the rest is the search text:

| Query | Becomes |
|---|---|
| "Python remote India" | text `python` + remote + India-eligible |
| "n8n freelancer" | text `n8n` + freelance |
| "data entry work from home" | text `data entry` + Work From Home |
| "AI jobs remote" | AI section + remote |

**Filters by page:**
- **Remote:** country, region (APAC/Asia/Worldwide…), category, skill, experience, salary (₹/yr), job type, posted date.
- **AI:** AI category, skill, experience, salary, type, country, remote eligibility.
- **Freelance:** skill, budget type, duration, category, experience, country.

**The 🇮🇳 India toggle** (India only / India + APAC / Worldwide / Any remote) is prominent on the remote and AI pages.

## 10. Deduplication

1. Same source + `source_job_id` updates the existing row. The update is skipped when `payload_hash` is unchanged.
2. Same canonical apply URL (tracking params, `www.` and trailing slashes removed) marks a duplicate.
3. Same `content_hash` = sha256(normalized title | normalized company | normalized location), with compatible salary (within 25%) and posted within 60 days, marks a duplicate.
4. Same normalized company, title Jaccard ≥ 0.75, and description shingle similarity ≥ 0.3 or an identical title, with compatible salary and dates, marks a duplicate.

When a duplicate is found, one canonical job is kept. A `job_sources_mapping` row is added for the extra source, and the canonical job borrows a missing logo or salary. Pages show "Found on multiple job sources" with a "View on X" link per source. Duplicates within the same sync batch are handled too.

## 11. AI classification

Deterministic signals as specified:

| Signal | Points |
|---|---|
| AI/ML/LLM in the title | +30 |
| Generative AI | +20 |
| ChatGPT / Claude / Gemini / OpenAI | +20 |
| RAG / LangChain / vector DB | +15 |
| AI agents | +15 |
| Prompt engineering | +10 |
| n8n / Zapier / Make / AI automation | +10 |
| Python + ML | +10 |
| PyTorch / TensorFlow frameworks *(added)* | +15 |
| ML terms in the description *(added)* | +10 |
| Midjourney / Runway / HeyGen creative AI tools *(added)* | +15 |

**Normalization and guards:**
- The score is clamped to 0–100.
- A single description-only signal is capped at 25.
- Without an AI title, the score is capped at 59 unless at least 4 independent signals fire. "We use Copilot day to day" stays General.
- "Test automation" is not AI automation.
- Gemini is ignored when it is the company name.

**Bands:**

| Score | Label |
|---|---|
| 80–100 | Strong AI Job |
| 60–79 | AI Related |
| 40–59 | AI/Automation Related |
| < 40 | General |

`ai_category` is set to the best AI subcategory. Categories and skills come from 54 rule-based categories, with case-sensitive patterns where needed (React, ML, RAG) and title-only matching for noisy words such as "research".

**Freelance classification:** employment type comes from source labels and Remote OK tags. Freelance/gig wording in the title wins, and a project budget implies freelance. Duration is parsed from text ("6 weeks" → 1–3 months, "one-time project", "ongoing"). Budget type (hourly, fixed price, monthly) comes from the salary period.

## 12. Security

- The service-role key, `CRON_SECRET`, the AI key and source keys are used only in server code. `lib/supabase/admin.ts` imports `server-only`, and no `NEXT_PUBLIC_` variable holds a secret.
- All ingestion runs server-side: Edge Functions or the `scripts/` CLI. External APIs are never called during a page request.
- **RLS** on every table, tested in integration: anonymous users cannot see pending or high-risk jobs, logs or admin RPCs, and cannot update jobs. Users cannot read each other's data or promote themselves.
- Third-party HTML is sanitized with `sanitize-html` and an allow-list; links get `rel=nofollow noopener ugc`. JSON-LD output is escaped.
- `/go/[id]` only redirects to the job's own http(s), mailto or wa.me target, so it is not an open redirect. Login `next=` only accepts same-site paths.
- **Employer posting** needs a phone-OTP-verified account and is limited to 5 posts a day. Contact phone numbers are stored separately and visible only to admins.
- Reports are rate-limited, and 3 or more "suspicious" reports automatically pull a job back into moderation.
- Analytics hold no IP, user agent or name: only a random session cookie, the event and the job. Raw events are deleted after 180 days.
- Security headers are set in `next.config.ts`.

## 13. Source attribution

- Every card shows "Source: X" (plus "+N" when the job is on several sources).
- The detail page has a source panel ("This job was published by X…") with a "View on X" link for every source.
- The primary button is **"Apply on original website"**, which goes to the source's own URL. There are no fake application forms for third-party jobs.
- Employer jobs show "Source: Mana Kosamu Employer".
- **JobPosting JSON-LD is emitted only for Mana Kosamu's own (employer or manual) approved listings**, never for aggregated jobs. Himalayas explicitly forbids feeding Google Jobs.
- Aggregated detail pages are `noindex, follow`.
- Topic pages with fewer than 3 live jobs and all filtered or search URLs are `noindex`. The sitemap lists only landing pages with enough jobs.

## 14. Testing results

**88 / 88 tests pass** with `npm test` plus `npm run test:integration` (re-run 14 Oct after adding 5 sources; `tests/sources-extra.test.ts` covers Remotive, Adzuna, Freelancer.com, Working Nomads and Arbeitnow, including missing-key errors, OAuth header, predicted-salary hiding and eligibility).
- **Fixture volume:** 69 source payloads covering every source shape. That is 63 distinct jobs plus cross-posts and edge cases. After the pipeline, at least 50 remote, 22 AI and 23 freelance-style jobs are live.
- **Unit tests (31):**
  - AI scoring, including the false-positive guards
  - Category and skill edge cases (Java vs JavaScript, C#, .NET)
  - Employment type, duration and seniority
  - Eligibility: US-only, worldwide, India, APAC, EMEA, timezone, a description restriction overriding a "Worldwide" label, security clearance, unknown location, Indian cities, hybrid, "join us" not read as the US
  - Salary parsing and formatting (USD, k-suffix, ₹, hourly, LPA, INR lakh/crore)
  - Risk flags (scam patterns, WhatsApp-only)
  - Normalization helpers and the RSS parser
- **Pipeline tests (21):**
  - Full sync of the three sources and cross-source dedupe (one job on 3 boards becomes 1 record with 3 mappings)
  - Invalid items skipped; scam held at high risk; expired jobs inactive; missing salary, logo, company and location handled
  - India eligibility end to end; original salary kept with INR alongside; freelance budgets
  - Idempotent re-sync
  - API failure falls back to RSS; API and RSS both failing is logged without crashing; empty response; malformed payload; HTTP 429 stops requests
  - Minimum polling interval respected; disabled sources skipped; full-feed removal
  - Jobicy taxonomy validation; Startup Jobs MCP handshake and SSE
- **Frontend logic (19):** all 9 example queries from the spec, filter parsing, eligibility labels, pay and INR formatting, "Posted 18 days ago", unique SEO titles, canonical and robots tags, and that the landing pages exist without auto-generated thin pages.
- **Integration (9):** real PostgreSQL 16, all migrations (also re-run to prove idempotency), PostgREST, supabase-js and the real `SupabaseJobRepository`:
  - Search and every India mode
  - Dedupe mappings
  - RLS for anonymous users, two separate users and self-promotion
  - Admin stats, `expire_jobs`, and alerts creating notifications once
  - Section counts
- **Manual end-to-end (production build, live mode against the local database):**
  - Every page returns 200, and filter, search and pagination URLs work.
  - Apply redirect goes to the original URL.
  - Events and reports are stored without PII.
  - An employer job is held, approved, gets JSON-LD, and its email apply works. A scam employer post stays hidden.
  - Sitemap excludes thin pages.
  - Mobile screenshots at 390 px have no horizontal scroll. The Telugu UI and bottom-sheet filters work.
- `tsc` passes, `next build` passes, and `deno check` passes for all Edge Functions.

**Not tested here** (the sandbox cannot reach these hosts):
- Live calls to Himalayas, Jobicy, Remote OK and Startup Jobs. Fixtures follow each source's documented shape; run `npm run sync` once after deploy and check `/admin/jobs` → Source health.
- Real SMS OTP delivery.
- The Anthropic summary call.

## 15. Deployment

1. Create or choose a Supabase project. Apply `supabase/migrations/*` in order (`supabase db push`).
2. `supabase secrets set CRON_SECRET=<random>`, then deploy the 10 functions with `--no-verify-jwt` (`supabase functions deploy --no-verify-jwt` deploys all of them). Merge `supabase/config.toml` into yours.
3. Fill in and run `supabase/cron.sql`.
4. Configure Auth: enable Phone with an SMS provider (MSG91/Twilio) and Email magic links; add the site URL and `/auth/callback` to redirect URLs.
5. Set the environment variables (§5) on Vercel or your Node host. Deploy with `npm run build && npm start`, or push to Vercel.
6. Run `npm run sync` (or press "Run sync" in `/admin/jobs`) and confirm each source is Healthy.
7. Promote your account: `update profiles set role='admin' where id='…'`.
8. **Before going live:**
   - Replace `/terms` and `/privacy` with reviewed legal text.
   - Update the exchange rates in admin. The seed values are approximate placeholders.
   - Re-confirm the source terms (SOURCES.md).
   - Decide on Startup Jobs.
