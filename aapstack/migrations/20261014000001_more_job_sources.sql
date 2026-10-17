-- Converted for AapStack (schema project_remotejobs) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.
-- Additional job sources (terms checked 2026-10-14; see docs/SOURCES.md).
-- Only Remotive ships enabled. The others need an API key, written consent, or a terms review
-- first: an admin enables them in /admin/jobs (ticking "Terms reviewed").
insert into job_sources (slug, name, source_type, base_url, api_url, rss_url, terms_url, enabled, attribution_required, attribution_text, allow_structured_data, rate_limit, min_interval_minutes, retention_days, full_feed, terms_verified_at, terms_notes, config) values
  ('remotive', 'Remotive', 'api', 'https://remotive.com', 'https://remotive.com/api/remote-jobs', null, 'https://github.com/remotive-com/remote-jobs-api', true, true, 'Source: Remotive', false,
   'No auth; ~4 requests/day max, >2/min blocked; jobs delayed 24h', 360, 30, true, '2026-10-14',
   'Link back to the Remotive job URL and name Remotive as the source. Must NOT submit Remotive jobs to other job boards/aggregators (Google Jobs, LinkedIn, Jooble…) → no JobPosting structured data. Do not use listings to collect signups/emails.',
   '{}'),
  ('adzuna', 'Adzuna', 'api', 'https://www.adzuna.in', 'https://api.adzuna.com/v1/api/jobs', null, 'https://developer.adzuna.com/docs/terms_of_service', false, true, 'Jobs by Adzuna', false,
   'app_id + app_key; 25/min, 250/day, 1,000/week, 2,500/month by default', 720, 30, false, null,
   'Commercial use beyond a 14-day trial needs Adzuna''s written consent/licence. Every listing must show an "Adzuna" label (≥116×23 px) linked to Adzuna. Predicted salaries are not shown. Set ADZUNA_APP_ID/ADZUNA_APP_KEY secrets.',
   '{"queries": [{"country": "in", "pages": 2}, {"country": "in", "what": "remote", "pages": 1}, {"country": "in", "what": "work from home", "pages": 1}], "max_requests_per_run": 6}'),
  ('freelancer', 'Freelancer.com', 'api', 'https://www.freelancer.com', 'https://www.freelancer.com/api/projects/0.1/projects/active/', null, 'https://www.freelancer.com/about/terms', false, true, 'Source: Freelancer.com', false,
   'OAuth token (freelancer-oauth-v1); poll politely', 360, 14, false, null,
   'Official API. Needs FREELANCER_OAUTH_TOKEN and confirmation that the API terms allow showing projects on Mana Kosamu. Candidates always bid on Freelancer.com.',
   '{"queries": [{"limit": 50, "pages": 2}, {"query": "AI automation", "limit": 50}, {"query": "n8n", "limit": 30}, {"query": "chatgpt", "limit": 30}, {"query": "video editing", "limit": 30}, {"query": "data entry", "limit": 30}]}'),
  ('workingnomads', 'Working Nomads', 'api', 'https://www.workingnomads.com', 'https://www.workingnomads.com/api/exposed_jobs/', null, 'https://www.workingnomads.com', false, true, 'Source: Working Nomads', false,
   'Public JSON feed; poll politely', 720, 30, true, null,
   'No published API terms found. Confirm with Working Nomads before enabling.', '{}'),
  ('arbeitnow', 'Arbeitnow', 'api', 'https://www.arbeitnow.com', 'https://www.arbeitnow.com/api/job-board-api', null, 'https://documenter.getpostman.com/view/18545278/UVJbJdKh', false, true, 'Source: Arbeitnow', false,
   'Free API, no key; poll politely', 720, 30, false, null,
   'Free job board API (mostly Europe). Review the Postman docs/terms before enabling.', '{"max_pages": 3, "remote_only": true}')
on conflict (slug) do nothing;

-- Cards now carry the job's country (used by the country filter and labels).
create or replace function job_card_json(j jobs)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', j.id, 'slug', j.slug, 'title', j.title, 'company_name', j.company_name, 'company_logo', j.company_logo,
    'short_description', j.short_description, 'category', j.category, 'subcategory', j.subcategory,
    'employment_type', j.employment_type, 'work_mode', j.work_mode, 'country', j.country, 'city', j.city, 'state', j.state, 'location_text', j.location_text,
    'eligibility_type', j.eligibility_type, 'eligible_countries', j.eligible_countries, 'eligible_regions', j.eligible_regions,
    'india_eligibility', j.india_eligibility, 'timezone_requirements', j.timezone_requirements, 'remote_worldwide', j.remote_worldwide,
    'salary_min', j.salary_min, 'salary_max', j.salary_max, 'salary_currency', j.salary_currency, 'salary_period', j.salary_period,
    'salary_inr_min', j.salary_inr_min, 'salary_inr_max', j.salary_inr_max,
    'budget_type', j.budget_type, 'budget_min', j.budget_min, 'budget_max', j.budget_max, 'budget_currency', j.budget_currency, 'budget_period', j.budget_period,
    'experience_min', j.experience_min, 'experience_max', j.experience_max, 'seniority', j.seniority,
    'skills', j.skills, 'keywords', j.keywords, 'sections', j.sections, 'ai_score', j.ai_score, 'ai_relevance', j.ai_relevance, 'ai_category', j.ai_category,
    'job_duration', j.job_duration, 'posted_at', j.posted_at, 'expires_at', j.expires_at, 'source_name', j.source_name,
    'source_count', j.source_count, 'risk_level', j.risk_level, 'is_featured', j.is_featured, 'is_verified', j.is_verified,
    'application_method', j.application_method
  );
$$;
