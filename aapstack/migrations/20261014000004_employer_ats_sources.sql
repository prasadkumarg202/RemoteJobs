-- Converted for AapStack (schema project_remotejobs) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.
-- Direct employer feeds: Greenhouse Job Board API and Lever Postings API (public, no auth).
-- Each source polls only the company boards an admin lists in config.boards (see /admin/jobs → Company boards).
-- With no boards configured a sync does nothing. Jobs outside India / not remote are skipped by default
-- (config.location_filter = "all" to keep everything). full_feed: a job that disappears from its company board is closed.
insert into job_sources (slug, name, source_type, base_url, api_url, rss_url, terms_url, enabled, attribution_required, attribution_text, allow_structured_data, rate_limit, min_interval_minutes, retention_days, full_feed, terms_verified_at, terms_notes, config) values
  ('greenhouse', 'Greenhouse', 'api', 'https://www.greenhouse.com', 'https://boards-api.greenhouse.io/v1/boards', null, 'https://developers.greenhouse.io/job-board.html', true, true, 'Source: company careers page (Greenhouse)', false,
   'Public GET API, no auth; one request per company board per run, 1 s apart', 600, 45, true, '2026-10-14',
   'Published vacancies are public ("authentication is not required for any GET endpoints"). Link to the company''s own job page; apply on the employer''s site.',
   '{"boards": [], "location_filter": "india_or_remote", "full_feed_min": 1}'),
  ('lever', 'Lever', 'api', 'https://www.lever.co', 'https://api.lever.co/v0/postings', null, 'https://github.com/lever/postings-api', true, true, 'Source: company careers page (Lever)', false,
   'Public GET API, no auth; 100 postings per request, 1 s apart', 600, 45, true, '2026-10-14',
   'Published postings are  Use api.eu.lever.co for EU-hosted companies (add "| eu" to the board line). Link to the company''s hosted posting.',
   '{"boards": [], "location_filter": "india_or_remote", "full_feed_min": 1, "max_pages_per_board": 5}')
on conflict (slug) do nothing;
