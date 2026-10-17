-- Converted for AapStack (schema project_remotejobs) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.
-- Three more sources:
--  • We Work Remotely: public RSS feed. The RSS page says "anyone can use the feed" with links back, but WWR's
--    API terms forbid "a job advertising or job search service" and storing their data, and don't say whether
--    RSS is covered → OFF until We Work Remotely confirms in writing (hello@weworkremotely.com).
--  • Jooble: job search API (free key, server secret JOOBLE_API_KEY) covering Indian part-time / WFH / fresher
--    jobs. Off until the key is set and Jooble's terms are confirmed (switch on in /admin/jobs).
--  • Ashby: public company job boards (like Greenhouse / Lever). Off until boards are saved in /admin/jobs.
insert into job_sources (slug, name, source_type, base_url, api_url, rss_url, terms_url, enabled, attribution_required, attribution_text, allow_structured_data, rate_limit, min_interval_minutes, retention_days, full_feed, terms_verified_at, terms_notes, config) values
  ('weworkremotely', 'We Work Remotely', 'rss', 'https://weworkremotely.com', null, 'https://weworkremotely.com/remote-jobs.rss', 'https://weworkremotely.com/api-terms-and-guidelines', false, true, 'Source: We Work Remotely', false,
   'One RSS request per run (or one per category feed in config.feeds), 1 s apart', 360, 30, false, null,
   'RSS page: "Anyone can use the feed, all we ask is that you attribute the links back." API terms forbid a job search service, storing data and applying outside weworkremotely.com. Enable only with WWR''s written permission. Every job links to (and is applied on) its weworkremotely.com page.',
   '{}'),
  ('jooble', 'Jooble', 'api', 'https://in.jooble.org', 'https://jooble.org/api', null, 'https://jooble.org/info/terms', false, true, 'Jobs by Jooble', false,
   'POST https://jooble.org/api/<key>; limits are set per key — at most 12 requests per run, 1.5 s apart', 720, 30, false, null,
   'Free key on request (jooble.org/api/about). Returns a snippet; candidates follow Jooble''s link to the full ad. Confirm Jooble''s terms for showing results before enabling.',
   '{"queries": [{"keywords": "work from home", "location": "India"}, {"keywords": "part time", "location": "India"}, {"keywords": "remote", "location": "India"}, {"keywords": "fresher", "location": "Hyderabad"}, {"keywords": "", "location": "Vijayawada"}, {"keywords": "", "location": "Visakhapatnam"}], "max_requests_per_run": 12}'),
  ('ashby', 'Ashby', 'api', 'https://www.ashbyhq.com', 'https://api.ashbyhq.com/posting-api/job-board', null, 'https://developers.ashbyhq.com/docs/public-job-posting-api', false, true, 'Source: company careers page (Ashby)', false,
   'Public GET API, no auth; one request per company board per run, 1 s apart', 600, 45, true, '2026-10-16',
   'Published postings are  Postings with isListed = false are direct-link-only and are skipped. Link to the company''s own job page.',
   '{"boards": [], "location_filter": "india_or_remote", "full_feed_min": 1}')
on conflict (slug) do nothing;
