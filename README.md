# Mana Kosamu — Remote + AI + Freelance Job Engine

Jobs module for Mana Kosamu: **Local, Remote, AI, Freelance/Gigs, Work From Home and Government** jobs, built with Next.js 15 (App Router) + TypeScript + Tailwind v4 + Supabase/PostgreSQL.

Remote listings are aggregated from sources whose current terms allow it (Himalayas, Jobicy, Remote OK, Remotive enabled; Adzuna India, Freelancer.com, Working Nomads, Arbeitnow and Startup Jobs built but disabled until keys/terms are in place), plus direct company careers pages via Greenhouse and Lever, and government notifications entered from official portals, normalized, classified (AI score, freelance type, duration, skills), checked for India eligibility, de-duplicated across sources, risk-checked, and served from Supabase — never fetched during a user's page request.

> See **[docs/DELIVERY.md](docs/DELIVERY.md)** for the full delivery report (files, migrations, functions, cron, security, attribution, test results, deployment).
> See **[docs/SOURCES.md](docs/SOURCES.md)** for each source's terms and polling policy.
> See **[docs/AAPSTACK.md](docs/AAPSTACK.md)** to run on AapStack instead of Supabase (migrations, Node functions, cron, one-command deploy).
> See **[docs/SUBSCRIPTIONS.md](docs/SUBSCRIPTIONS.md)** for the paid app: mobile-OTP sign-in with automatic OTP fill, one device per account, Razorpay subscriptions.
> See **[docs/AFFILIATES.md](docs/AFFILIATES.md)** for earning from affiliate partners (Fiverr, Upwork, Coursera, Udemy, Payoneer, Wise …) — all off until you paste your links in `/admin/jobs/affiliates`.

## Run it in 2 minutes (demo mode)

```bash
npm install
npm run dev          # http://localhost:3000/jobs
```

With no Supabase keys the app runs in **demo mode** on `data/demo-jobs.json` (87 sample jobs produced by the real ingestion pipeline from test fixtures). Sign-in, saving to an account, alerts and posting jobs need Supabase.

## Connect Supabase

1. Copy `.env.example` → `.env.local` and fill in the keys. `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are server-only.
2. Apply migrations (`supabase/migrations/*.sql`) with `supabase db push` or paste them into the SQL editor in order. They are idempotent and *extend* existing `jobs`/`profiles` tables instead of replacing them.
3. Deploy the Edge Functions and set their secrets:
   ```bash
   supabase secrets set CRON_SECRET=... # same value as in .env.local
   supabase functions deploy --no-verify-jwt   # deploys all sync-* functions and expire-jobs
   ```
4. Run `supabase/cron.sql` in the SQL editor (fill in your project URL and the cron secret first).
5. First load: `npm run sync` (calls the real sources once from your machine, using the same code as the functions).
6. Make yourself an admin: `update profiles set role = 'admin' where id = '<your auth user id>';` → `/admin/jobs`.
7. Phone OTP sign-in needs an SMS provider (e.g. Twilio / MSG91) configured in Supabase Auth.

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Unit + pipeline + frontend logic tests (fixtures, no network) |
| `npm run test:integration` | Recreates a local Postgres DB, applies migrations, runs sync through PostgREST + supabase-js, tests RLS/RPCs (needs local Postgres on :54329 and PostgREST on :3011, see `tests/sql/`) |
| `npm run sync [slug] [--force]` | Run a source sync against your Supabase project |
| `npm run sync:fixtures` | Load bundled fixture jobs into your Supabase project (dev only) |
| `npm run functions:check` | Type-check Edge Functions with Deno |
| `npm run seed-sql` | Regenerate the category/source seed migration from the engine taxonomy |
| `npm run fixtures` / `npm run demo-data` | Regenerate test fixtures / demo dataset |

## Layout

```
supabase/functions/_shared/engine/   ← ingestion engine (plain TS, runs in Deno, Node and Vitest)
  adapters/                            Himalayas, Jobicy, Remote OK, Startup Jobs (MCP), Employer, FutureFreelance template
  normalize · classify · eligibility · salary · risk · dedupe · pipeline · repository · http · rss · taxonomy · geo
supabase/functions/sync-*/            one Edge Function per source (3 lines each)
supabase/functions/expire-jobs/       expiry + alerts fan-out
supabase/migrations/                  schema, functions + RLS, seed
supabase/cron.sql                     pg_cron schedules
app/jobs/…                            pages (home, remote, ai, freelance, wfh, government, local, search, [slug], saved, alerts, post)
app/admin/jobs/…                      dashboard + moderation
components/ lib/                      UI and data access
tests/                                fixtures, unit, pipeline, frontend, integration
```
