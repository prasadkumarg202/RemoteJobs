-- All migrations in order, for the AapStack SQL editor (prefer "odb db push" or scripts/aapstack/deploy.mjs).
-- Schema: project_remotejobs

-- ===== 20261010000001_job_engine_schema.sql =====
-- Converted for AapStack (schema project_remotejobs) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.
-- Mana Kosamu — Remote + AI + Freelance Job Engine: core schema
-- Safe to run on an existing Mana Kosamu database: every object is created
-- "if not exists" and existing tables are extended with "add column if not exists".

-- extension pg_trgm: enable it in AapStack → Database → Extensions (installed in public)
-- extension unaccent: enable it in AapStack → Database → Extensions (installed in public)

-- ── Profiles (reuse the app's table if it exists; add the columns we need) ───
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table profiles add column if not exists display_name text;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists role text not null default 'user';
alter table profiles add column if not exists preferred_language text not null default 'en';
alter table profiles add column if not exists home_city text;
alter table profiles add column if not exists updated_at timestamptz not null default now();
do $$ begin
  alter table profiles add constraint profiles_role_check check (role in ('user','employer','moderator','admin'));
exception when duplicate_object then null; end $$;

create or replace function mk_jobs_handle_new_user()
returns trigger language plpgsql security definer set search_path = project_remotejobs, public as $$
begin
  insert into profiles (id, phone, display_name)
  values (new.id, new.phone, coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

-- (AapStack: no trigger on the shared auth.users table; bind_device() creates the profile at first sign-in)

create or replace function is_jobs_admin()
returns boolean language sql stable security definer set search_path = project_remotejobs, public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','moderator'));
$$;

-- ── Sources ─────────────────────────────────────────────────────────────────
create table if not exists job_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  source_type text not null check (source_type in ('api','rss','manual','employer','mcp')),
  base_url text,
  api_url text,
  rss_url text,
  terms_url text,
  enabled boolean not null default false,
  attribution_required boolean not null default true,
  attribution_text text,
  allow_structured_data boolean not null default false, -- may we emit JobPosting JSON-LD?
  rate_limit text,                                        -- human description of the source's policy
  min_interval_minutes integer not null default 60,       -- enforced by the pipeline
  retention_days integer not null default 30,
  full_feed boolean not null default false,               -- payload lists every live job
  terms_verified_at timestamptz,
  terms_notes text,
  config jsonb not null default '{}'::jsonb,
  http_cache jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  last_jobs_fetched integer,
  last_jobs_inserted integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Jobs ────────────────────────────────────────────────────────────────────
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Columns are added individually so an existing `jobs` table is extended, not replaced.
alter table jobs
  add column if not exists slug text,
  add column if not exists source_id uuid references job_sources (id) on delete set null,
  add column if not exists source_name text,
  add column if not exists source_job_id text,
  add column if not exists external_url text,
  add column if not exists apply_url text,
  add column if not exists canonical_url text,
  add column if not exists title text,
  add column if not exists company_name text,
  add column if not exists company_logo text,
  add column if not exists description text,
  add column if not exists description_html text,
  add column if not exists short_description text,
  add column if not exists category text,
  add column if not exists subcategory text,
  add column if not exists employment_type text not null default 'full_time',
  add column if not exists work_mode text not null default 'unknown',
  add column if not exists country text,
  add column if not exists state text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists location_text text,
  add column if not exists remote_allowed boolean not null default false,
  add column if not exists remote_worldwide boolean not null default false,
  add column if not exists eligibility_type text not null default 'unknown',
  add column if not exists eligible_countries text[] not null default '{}',
  add column if not exists eligible_regions text[] not null default '{}',
  add column if not exists india_eligibility text not null default 'unknown',
  add column if not exists timezone text,
  add column if not exists timezone_requirements text[] not null default '{}',
  add column if not exists salary_min numeric,
  add column if not exists salary_max numeric,
  add column if not exists salary_currency text,
  add column if not exists salary_period text,
  add column if not exists salary_inr_min numeric,
  add column if not exists salary_inr_max numeric,
  add column if not exists salary_inr_annual_max numeric,
  add column if not exists budget_type text,
  add column if not exists budget_min numeric,
  add column if not exists budget_max numeric,
  add column if not exists budget_currency text,
  add column if not exists budget_period text,
  add column if not exists experience_min integer,
  add column if not exists experience_max integer,
  add column if not exists seniority text not null default 'any',
  add column if not exists skills text[] not null default '{}',
  add column if not exists keywords text[] not null default '{}',
  add column if not exists sections text[] not null default '{}',
  add column if not exists ai_score integer not null default 0,
  add column if not exists ai_category text,
  add column if not exists ai_relevance text not null default 'general',
  add column if not exists job_duration text not null default 'unknown',
  add column if not exists posted_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists is_active boolean not null default false,
  add column if not exists is_featured boolean not null default false,
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_government boolean not null default false,
  add column if not exists moderation_status text not null default 'pending',
  add column if not exists moderation_note text,
  add column if not exists moderated_by uuid references auth.users (id) on delete set null,
  add column if not exists moderated_at timestamptz,
  add column if not exists risk_score integer not null default 0,
  add column if not exists risk_level text not null default 'low',
  add column if not exists risk_flags text[] not null default '{}',
  add column if not exists normalized_title text,
  add column if not exists normalized_company text,
  add column if not exists normalized_location text,
  add column if not exists content_hash text,
  add column if not exists payload_hash text,
  add column if not exists source_count integer not null default 1,
  add column if not exists application_method text not null default 'external',
  add column if not exists apply_email text,
  add column if not exists apply_whatsapp text,
  add column if not exists submitted_by uuid references auth.users (id) on delete set null,
  add column if not exists search_vector tsvector;

do $$
declare r record;
begin
  for r in select * from (values
    ('jobs_employment_type_check', $c$check (employment_type in ('full_time','part_time','contract','temporary','freelance','gig','internship'))$c$),
    ('jobs_work_mode_check', $c$check (work_mode in ('remote','hybrid','onsite','unknown'))$c$),
    ('jobs_job_duration_check', $c$check (job_duration in ('one_time','less_than_1_month','1_to_3_months','3_to_6_months','6_plus_months','ongoing','unknown'))$c$),
    ('jobs_eligibility_type_check', $c$check (eligibility_type in ('worldwide','country_specific','region_specific','timezone_specific','unknown'))$c$),
    ('jobs_india_eligibility_check', $c$check (india_eligibility in ('explicit','worldwide','region','timezone','not_eligible','unknown'))$c$),
    ('jobs_salary_period_check', $c$check (salary_period is null or salary_period in ('hourly','daily','weekly','monthly','yearly','project','unknown'))$c$),
    ('jobs_budget_type_check', $c$check (budget_type is null or budget_type in ('fixed_price','hourly','monthly','unknown'))$c$),
    ('jobs_moderation_status_check', $c$check (moderation_status in ('pending','approved','rejected','expired'))$c$),
    ('jobs_risk_level_check', $c$check (risk_level in ('low','medium','high'))$c$),
    ('jobs_ai_relevance_check', $c$check (ai_relevance in ('strong_ai','ai_related','ai_automation','general'))$c$),
    ('jobs_ai_score_check', $c$check (ai_score between 0 and 100)$c$),
    ('jobs_application_method_check', $c$check (application_method in ('external','email','whatsapp','phone'))$c$)
  ) as t(name, def) loop
    if not exists (select 1 from pg_constraint where conname = r.name and conrelid = 'jobs'::regclass) then
      execute format('alter table jobs add constraint %I %s', r.name, r.def);
    end if;
  end loop;
end $$;

create unique index if not exists jobs_slug_key on jobs (slug);
create unique index if not exists jobs_source_job_key on jobs (source_id, source_job_id);
create index if not exists jobs_active_posted_idx on jobs (posted_at desc) where is_active;
create index if not exists jobs_sections_idx on jobs using gin (sections);
create index if not exists jobs_keywords_idx on jobs using gin (keywords);
create index if not exists jobs_eligible_countries_idx on jobs using gin (eligible_countries);
create index if not exists jobs_search_idx on jobs using gin (search_vector);
create index if not exists jobs_title_trgm_idx on jobs using gin (title public.gin_trgm_ops);
create index if not exists jobs_content_hash_idx on jobs (content_hash);
create index if not exists jobs_canonical_url_idx on jobs (canonical_url);
create index if not exists jobs_normalized_company_idx on jobs (normalized_company);
create index if not exists jobs_india_idx on jobs (india_eligibility) where is_active;
create index if not exists jobs_ai_score_idx on jobs (ai_score desc) where is_active;
create index if not exists jobs_moderation_idx on jobs (moderation_status, risk_level);
create index if not exists jobs_expires_idx on jobs (expires_at) where is_active and expires_at is not null;

create or replace function jobs_before_write()
returns trigger language plpgsql set search_path = project_remotejobs, public as $$
begin
  new.updated_at := now();
  new.search_vector :=
      setweight(to_tsvector('english', coalesce(new.title, '')), 'A')
   || setweight(to_tsvector('simple', coalesce(new.title, '')), 'A')
   || setweight(to_tsvector('simple', coalesce(new.company_name, '')), 'B')
   || setweight(to_tsvector('simple',
        array_to_string(new.skills, ' ') || ' ' || array_to_string(new.keywords, ' ') || ' ' ||
        coalesce(new.category, '') || ' ' || coalesce(new.subcategory, '') || ' ' || coalesce(new.ai_category, '')), 'B')
   || setweight(to_tsvector('english', left(coalesce(new.description, ''), 20000)), 'C');
  if new.is_active and new.moderation_status = 'approved' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

drop trigger if exists jobs_before_write on jobs;
create trigger jobs_before_write before insert or update on jobs
  for each row execute function jobs_before_write();

-- ── Cross-source mapping (dedupe) ───────────────────────────────────────────
create table if not exists job_sources_mapping (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  source_id uuid not null references job_sources (id) on delete cascade,
  external_job_id text not null,
  external_url text not null,
  is_primary boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source_id, external_job_id)
);
create index if not exists job_sources_mapping_job_idx on job_sources_mapping (job_id);

create or replace function job_mapping_count()
returns trigger language plpgsql security definer set search_path = project_remotejobs, public as $$
declare v_job uuid := coalesce(new.job_id, old.job_id);
begin
  update jobs set source_count = greatest(1, (select count(*) from job_sources_mapping where job_id = v_job))
  where id = v_job;
  return null;
end $$;
drop trigger if exists job_mapping_count on job_sources_mapping;
create trigger job_mapping_count after insert or delete on job_sources_mapping
  for each row execute function job_mapping_count();

-- ── Categories ──────────────────────────────────────────────────────────────
create table if not exists job_categories (
  slug text primary key,
  name text not null,
  name_te text,
  parent_slug text references job_categories (slug) on delete set null,
  kind text not null default 'field' check (kind in ('group','field','skill')),
  is_ai boolean not null default false,
  sort_order integer not null default 0,
  seo_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Exchange rates (controlled, admin-editable) ─────────────────────────────
create table if not exists exchange_rates (
  currency text primary key check (currency ~ '^[A-Z]{3}$'),
  inr_per_unit numeric(14, 6) not null check (inr_per_unit > 0),
  source text not null default 'manual',
  updated_at timestamptz not null default now()
);

-- ── Sync logs ───────────────────────────────────────────────────────────────
create table if not exists job_sync_logs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references job_sources (id) on delete cascade,
  kind text not null default 'sync' check (kind in ('sync','expiry','alerts')),
  status text not null default 'running' check (status in ('running','success','partial','failed','skipped')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  jobs_found integer not null default 0,
  jobs_added integer not null default 0,
  jobs_updated integer not null default 0,
  jobs_skipped integer not null default 0,
  jobs_duplicates integer not null default 0,
  jobs_expired integer not null default 0,
  jobs_flagged integer not null default 0,
  used_fallback boolean not null default false,
  errors jsonb not null default '[]'::jsonb
);
create index if not exists job_sync_logs_source_idx on job_sync_logs (source_id, started_at desc);

-- ── User features ───────────────────────────────────────────────────────────
create table if not exists saved_jobs (
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create table if not exists hidden_jobs (
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create table if not exists job_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  reason text not null check (reason in ('suspicious','expired','wrong_info','duplicate','offensive','other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists job_reports_job_idx on job_reports (job_id);
create index if not exists job_reports_status_idx on job_reports (status, created_at desc);

create table if not exists job_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  keywords text,
  category text,
  country text,
  india_mode text check (india_mode is null or india_mode in ('india_only','india_apac','worldwide','eligible','any')),
  remote_only boolean not null default false,
  ai_only boolean not null default false,
  freelance_only boolean not null default false,
  salary_min_inr numeric,
  employment_types text[] not null default '{}',
  channels text[] not null default '{in_app}',
  is_active boolean not null default true,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists job_alerts_user_idx on job_alerts (user_id);

create table if not exists job_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  alert_id uuid references job_alerts (id) on delete cascade,
  job_id uuid references jobs (id) on delete cascade,
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (alert_id, job_id)
);
create index if not exists job_notifications_user_idx on job_notifications (user_id, created_at desc);

-- Privacy-minimal analytics: no IP, no user agent; session_id is a random cookie.
create table if not exists job_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('job_view','apply_click','save_job','share_job','report_job','search','filter_used','hide_job')),
  job_id uuid references jobs (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  session_id text,
  section text,
  query text check (char_length(query) <= 200),
  filters jsonb,
  created_at timestamptz not null default now()
);
create index if not exists job_events_type_time_idx on job_events (event_type, created_at desc);
create index if not exists job_events_job_idx on job_events (job_id) where job_id is not null;

-- Employer contact details are kept apart from the public job row.
create table if not exists job_submission_contacts (
  job_id uuid primary key references jobs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  contact_name text not null,
  contact_phone text not null,
  terms_accepted_at timestamptz not null,
  privacy_accepted_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists job_ai_summaries (
  job_id uuid not null references jobs (id) on delete cascade,
  language text not null default 'te',
  summary text not null,
  model text,
  created_at timestamptz not null default now(),
  primary key (job_id, language)
);

-- ===== 20261010000002_job_engine_functions_rls.sql =====
-- Converted for AapStack (schema project_remotejobs) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.
-- Search, maintenance, alerts, admin RPCs and row-level security.

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function current_profile_role()
returns text language sql stable security definer set search_path = project_remotejobs, public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function india_mode_match(p_mode text, p_elig text)
returns boolean language sql immutable as $$
  select case coalesce(p_mode, 'any')
    when 'any' then true
    when 'india_only' then p_elig = 'explicit'
    when 'india_apac' then p_elig in ('explicit', 'region', 'timezone')
    when 'worldwide' then p_elig = 'worldwide'
    when 'eligible' then p_elig in ('explicit', 'worldwide', 'region', 'timezone')
    else true end;
$$;

create or replace function job_card_json(j jobs)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', j.id, 'slug', j.slug, 'title', j.title, 'company_name', j.company_name, 'company_logo', j.company_logo,
    'short_description', j.short_description, 'category', j.category, 'subcategory', j.subcategory,
    'employment_type', j.employment_type, 'work_mode', j.work_mode, 'city', j.city, 'state', j.state, 'location_text', j.location_text,
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

-- ── Search ──────────────────────────────────────────────────────────────────
create or replace function search_jobs(
  p_query text default null,
  p_sections text[] default null,
  p_india_mode text default null,
  p_country text default null,
  p_regions text[] default null,
  p_categories text[] default null,
  p_ai_categories text[] default null,
  p_ai_min integer default null,
  p_employment_types text[] default null,
  p_work_modes text[] default null,
  p_seniority text[] default null,
  p_salary_min_inr numeric default null,
  p_budget_types text[] default null,
  p_durations text[] default null,
  p_posted_within_days integer default null,
  p_sources text[] default null,
  p_city text default null,
  p_exclude_ids uuid[] default null,
  p_sort text default 'relevance',
  p_limit integer default 20,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security invoker set search_path = project_remotejobs, public as $$
declare
  v_q text := nullif(btrim(p_query), '');
  v_tsq tsquery;
  v_result jsonb;
begin
  if v_q is not null then
    v_tsq := websearch_to_tsquery('english', v_q) || websearch_to_tsquery('simple', v_q);
    if v_tsq::text = '' then v_tsq := null; end if;
  end if;

  with matched as (
    select j, case when v_tsq is not null then ts_rank_cd(j.search_vector, v_tsq, 32) else 0 end as rank
    from jobs j
    where j.is_active and j.moderation_status = 'approved'
      and (j.expires_at is null or j.expires_at > now())
      and (v_q is null or (v_tsq is not null and j.search_vector @@ v_tsq) or j.title ilike '%' || v_q || '%' or j.company_name ilike '%' || v_q || '%')
      and (p_sections is null or j.sections @> p_sections)
      and india_mode_match(p_india_mode, j.india_eligibility)
      and (p_country is null or j.country = p_country or p_country = any (j.eligible_countries))
      and (p_regions is null or j.eligible_regions && p_regions or ('worldwide' = any (p_regions) and j.remote_worldwide))
      and (p_categories is null or j.category = any (p_categories) or j.subcategory = any (p_categories) or j.keywords && p_categories)
      and (p_ai_categories is null or j.ai_category = any (p_ai_categories) or j.keywords && p_ai_categories)
      and (p_ai_min is null or j.ai_score >= p_ai_min)
      and (p_employment_types is null or j.employment_type = any (p_employment_types))
      and (p_work_modes is null or j.work_mode = any (p_work_modes))
      and (p_seniority is null or j.seniority = any (p_seniority))
      and (p_salary_min_inr is null or j.salary_inr_annual_max >= p_salary_min_inr)
      and (p_budget_types is null or j.budget_type = any (p_budget_types))
      and (p_durations is null or j.job_duration = any (p_durations))
      and (p_posted_within_days is null or j.posted_at >= now() - make_interval(days => p_posted_within_days))
      and (p_sources is null or exists (select 1 from job_sources s where s.id = j.source_id and s.slug = any (p_sources)))
      and (p_city is null or j.city ilike p_city)
      and (p_exclude_ids is null or not (j.id = any (p_exclude_ids)))
  ),
  page as (
    select m.j, m.rank from matched m
    order by
      case when p_sort = 'salary' then (m.j).salary_inr_annual_max end desc nulls last,
      case when p_sort = 'relevance' and v_tsq is not null then m.rank end desc nulls last,
      (m.j).is_featured desc,
      (m.j).posted_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'items', coalesce((select jsonb_agg(job_card_json(p.j) order by
        case when p_sort = 'salary' then (p.j).salary_inr_annual_max end desc nulls last,
        case when p_sort = 'relevance' and v_tsq is not null then p.rank end desc nulls last,
        (p.j).is_featured desc, (p.j).posted_at desc) from page p), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function job_section_counts()
returns jsonb language sql stable security invoker set search_path = project_remotejobs, public as $$
  select jsonb_build_object(
    'all', count(*),
    'remote', count(*) filter (where 'remote' = any (sections)),
    'ai', count(*) filter (where 'ai' = any (sections)),
    'freelance', count(*) filter (where 'freelance' = any (sections)),
    'wfh', count(*) filter (where 'wfh' = any (sections)),
    'local', count(*) filter (where 'local' = any (sections)),
    'government', count(*) filter (where 'government' = any (sections)),
    'india', count(*) filter (where work_mode = 'remote' and india_eligibility in ('explicit','worldwide','region','timezone'))
  )
  from jobs
  where is_active and moderation_status = 'approved' and (expires_at is null or expires_at > now());
$$;

-- ── Maintenance (service role only) ─────────────────────────────────────────
create or replace function deactivate_missing_jobs(p_source_id uuid, p_seen text[])
returns integer language plpgsql security definer set search_path = project_remotejobs, public as $$
declare v_count integer;
begin
  update jobs set is_active = false, moderation_status = 'expired'
  where source_id = p_source_id and is_active and not (source_job_id = any (p_seen));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function expire_jobs()
returns jsonb language plpgsql security definer set search_path = project_remotejobs, public as $$
declare
  v_expired integer := 0; v_removed integer := 0; v_retention integer := 0; v_employer integer := 0;
  v_started timestamptz := now();
begin
  -- 1. Past their expiry date
  update jobs set is_active = false, moderation_status = 'expired'
  where is_active and expires_at is not null and expires_at < now();
  get diagnostics v_expired = row_count;

  -- 2. No longer seen in any source feed within that source's retention window (removed upstream)
  update jobs j set is_active = false, moderation_status = 'expired'
  where j.is_active and j.source_id in (select id from job_sources where source_type in ('api','rss','mcp'))
    and not exists (
      select 1 from job_sources_mapping m join job_sources s on s.id = m.source_id
      where m.job_id = j.id and m.last_seen_at > now() - make_interval(days => s.retention_days));
  get diagnostics v_removed = row_count;

  -- 3. Older than the source retention period
  update jobs j set is_active = false, moderation_status = 'expired'
  from job_sources s
  where j.source_id = s.id and j.is_active and s.source_type in ('api','rss','mcp')
    and j.posted_at < now() - make_interval(days => s.retention_days);
  get diagnostics v_retention = row_count;

  -- 4. Employer jobs without an expiry date: 60 days after publishing
  update jobs j set is_active = false, moderation_status = 'expired'
  where j.is_active and j.expires_at is null and coalesce(j.published_at, j.created_at) < now() - interval '60 days'
    and j.source_id in (select id from job_sources where source_type in ('employer','manual'));
  get diagnostics v_employer = row_count;

  insert into job_sync_logs (kind, status, started_at, completed_at, jobs_expired)
  values ('expiry', 'success', v_started, now(), v_expired + v_removed + v_retention + v_employer);

  return jsonb_build_object('expired', v_expired, 'removed_upstream', v_removed, 'beyond_retention', v_retention, 'employer_stale', v_employer);
end $$;

create or replace function process_job_alerts()
returns integer language plpgsql security definer set search_path = project_remotejobs, public as $$
declare a record; v_total integer := 0; v_n integer; v_started timestamptz := now();
begin
  for a in select * from job_alerts where is_active loop
    insert into job_notifications (user_id, alert_id, job_id, title, body, url)
    select a.user_id, a.id, j.id, j.title,
           j.company_name || ' · ' || case when j.work_mode = 'remote' then 'Remote' else coalesce(j.city, '') end,
           '/jobs/' || j.slug
    from jobs j
    where j.is_active and j.moderation_status = 'approved'
      and coalesce(j.published_at, j.created_at) > a.last_checked_at
      and (a.keywords is null or btrim(a.keywords) = '' or j.search_vector @@ (websearch_to_tsquery('english', a.keywords) || websearch_to_tsquery('simple', a.keywords)))
      and (a.category is null or j.category = a.category or j.subcategory = a.category or a.category = any (j.keywords))
      and (a.country is null or a.country = any (j.eligible_countries) or j.country = a.country or j.remote_worldwide)
      and (not a.remote_only or j.work_mode = 'remote')
      and (not a.ai_only or j.ai_score >= 40)
      and (not a.freelance_only or 'freelance' = any (j.sections))
      and india_mode_match(a.india_mode, j.india_eligibility)
      and (a.salary_min_inr is null or j.salary_inr_annual_max >= a.salary_min_inr)
      and (cardinality(a.employment_types) = 0 or j.employment_type = any (a.employment_types))
      and not exists (select 1 from hidden_jobs h where h.user_id = a.user_id and h.job_id = j.id)
    order by j.posted_at desc
    limit 20
    on conflict (alert_id, job_id) do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    update job_alerts set last_checked_at = v_started where id = a.id;
  end loop;
  insert into job_sync_logs (kind, status, started_at, completed_at, jobs_added)
  values ('alerts', 'success', v_started, now(), v_total);
  return v_total;
end $$;

revoke execute on function deactivate_missing_jobs(uuid, text[]) from public, anon, authenticated;
revoke execute on function expire_jobs() from public, anon, authenticated;
revoke execute on function process_job_alerts() from public, anon, authenticated;

-- ── Admin RPCs ──────────────────────────────────────────────────────────────
create or replace function admin_job_stats()
returns jsonb language plpgsql stable security definer set search_path = project_remotejobs, public as $$
declare v jsonb;
begin
  if not is_jobs_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'total', count(*),
    'active', count(*) filter (where is_active),
    'remote', count(*) filter (where is_active and work_mode = 'remote'),
    'ai', count(*) filter (where is_active and ai_score >= 40),
    'freelance', count(*) filter (where is_active and 'freelance' = any (sections)),
    'india_eligible', count(*) filter (where is_active and work_mode = 'remote' and india_eligibility in ('explicit','worldwide','region','timezone')),
    'added_today', count(*) filter (where created_at >= date_trunc('day', now())),
    'expired_today', count(*) filter (where moderation_status = 'expired' and updated_at >= date_trunc('day', now())),
    'duplicates', coalesce(sum(source_count - 1) filter (where source_count > 1), 0),
    'multi_source_jobs', count(*) filter (where source_count > 1),
    'flagged', count(*) filter (where risk_level in ('medium','high') and moderation_status <> 'rejected'),
    'pending', count(*) filter (where moderation_status = 'pending'),
    'open_reports', (select count(*) from job_reports where status = 'open')
  ) into v from jobs;

  return v || jsonb_build_object('sources', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name, 'enabled', s.enabled, 'source_type', s.source_type,
      'last_run_at', s.last_run_at, 'last_success_at', s.last_success_at, 'last_error_at', s.last_error_at, 'last_error', s.last_error,
      'last_jobs_fetched', s.last_jobs_fetched, 'last_jobs_inserted', s.last_jobs_inserted, 'terms_url', s.terms_url,
      'terms_verified_at', s.terms_verified_at, 'min_interval_minutes', s.min_interval_minutes, 'rate_limit', s.rate_limit,
      'active_jobs', (select count(*) from jobs j where j.source_id = s.id and j.is_active),
      'recent_logs', (select coalesce(jsonb_agg(l order by l.started_at desc), '[]'::jsonb) from (
          select started_at, completed_at, status, jobs_found, jobs_added, jobs_updated, jobs_skipped, jobs_duplicates, jobs_expired, used_fallback, errors
          from job_sync_logs where source_id = s.id order by started_at desc limit 5) l)
    ) order by s.name) from job_sources s), '[]'::jsonb));
end $$;

create or replace function admin_job_analytics(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = project_remotejobs, public as $$
declare v_since timestamptz := now() - make_interval(days => p_days);
begin
  if not is_jobs_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'events', (select coalesce(jsonb_object_agg(event_type, n), '{}'::jsonb) from (
        select event_type, count(*) n from job_events where created_at >= v_since group by 1) t),
    'top_searches', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select lower(query) as query, count(*) as n from job_events
        where event_type = 'search' and created_at >= v_since and query is not null group by 1 order by 2 desc limit 15) t),
    'most_viewed', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select j.slug, j.title, j.company_name, count(*) as n from job_events e join jobs j on j.id = e.job_id
        where e.event_type = 'job_view' and e.created_at >= v_since group by 1, 2, 3 order by 4 desc limit 10) t),
    'most_applied_category', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select coalesce(j.subcategory, j.category, 'other') as category, count(*) as n from job_events e join jobs j on j.id = e.job_id
        where e.event_type = 'apply_click' and e.created_at >= v_since group by 1 order by 2 desc limit 10) t),
    'popular_ai_skills', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select k as skill, count(*) as n from job_events e join jobs j on j.id = e.job_id, unnest(j.keywords) k
        join job_categories c on c.slug = k and c.is_ai
        where e.event_type in ('job_view','apply_click') and e.created_at >= v_since group by 1 order by 2 desc limit 10) t),
    'searches_by_section', (select coalesce(jsonb_object_agg(coalesce(section, 'all'), n), '{}'::jsonb) from (
        select section, count(*) n from job_events where event_type = 'search' and created_at >= v_since group by 1) t)
  );
end $$;

-- ── Row-level security ─────────────────────────────────────────────────────
alter table jobs enable row level security;
alter table job_sources enable row level security;
alter table job_sources_mapping enable row level security;
alter table job_categories enable row level security;
alter table exchange_rates enable row level security;
alter table job_sync_logs enable row level security;
alter table saved_jobs enable row level security;
alter table hidden_jobs enable row level security;
alter table job_reports enable row level security;
alter table job_alerts enable row level security;
alter table job_notifications enable row level security;
alter table job_events enable row level security;
alter table job_submission_contacts enable row level security;
alter table job_ai_summaries enable row level security;
alter table profiles enable row level security;

do $$
declare p record;
begin
  for p in select * from (values
    -- jobs
    ('jobs', 'jobs_public_read', 'select', 'is_active and moderation_status = ''approved''', null),
    ('jobs', 'jobs_owner_read', 'select', 'submitted_by = auth.uid()', null),
    ('jobs', 'jobs_admin_all', 'all', 'is_jobs_admin()', 'is_jobs_admin()'),
    -- reference data
    ('job_sources', 'job_sources_public_read', 'select', 'true', null),
    ('job_sources', 'job_sources_admin_write', 'all', 'is_jobs_admin()', 'is_jobs_admin()'),
    ('job_sources_mapping', 'job_sources_mapping_public_read', 'select', 'true', null),
    ('job_categories', 'job_categories_public_read', 'select', 'true', null),
    ('job_categories', 'job_categories_admin_write', 'all', 'is_jobs_admin()', 'is_jobs_admin()'),
    ('exchange_rates', 'exchange_rates_public_read', 'select', 'true', null),
    ('exchange_rates', 'exchange_rates_admin_write', 'all', 'is_jobs_admin()', 'is_jobs_admin()'),
    ('job_sync_logs', 'job_sync_logs_admin_read', 'select', 'is_jobs_admin()', null),
    ('job_ai_summaries', 'job_ai_summaries_public_read', 'select', 'true', null),
    -- user-owned
    ('saved_jobs', 'saved_jobs_owner', 'all', 'user_id = auth.uid()', 'user_id = auth.uid()'),
    ('hidden_jobs', 'hidden_jobs_owner', 'all', 'user_id = auth.uid()', 'user_id = auth.uid()'),
    ('job_alerts', 'job_alerts_owner', 'all', 'user_id = auth.uid()', 'user_id = auth.uid()'),
    ('job_notifications', 'job_notifications_owner_read', 'select', 'user_id = auth.uid()', null),
    ('job_notifications', 'job_notifications_owner_update', 'update', 'user_id = auth.uid()', 'user_id = auth.uid()'),
    ('job_notifications', 'job_notifications_owner_delete', 'delete', 'user_id = auth.uid()', null),
    ('job_reports', 'job_reports_insert_own', 'insert', null, 'user_id is null or user_id = auth.uid()'),
    ('job_reports', 'job_reports_admin', 'all', 'is_jobs_admin()', 'is_jobs_admin()'),
    ('job_submission_contacts', 'job_submission_contacts_owner_read', 'select', 'user_id = auth.uid()', null),
    ('job_submission_contacts', 'job_submission_contacts_admin_read', 'select', 'is_jobs_admin()', null),
    ('job_events', 'job_events_admin_read', 'select', 'is_jobs_admin()', null),
    ('profiles', 'profiles_self_read', 'select', 'id = auth.uid() or is_jobs_admin()', null),
    ('profiles', 'profiles_self_update', 'update', 'id = auth.uid()', 'id = auth.uid() and role = current_profile_role()')
  ) as t(tbl, name, cmd, using_expr, check_expr) loop
    if not exists (select 1 from pg_policies where schemaname = current_schema() and tablename = p.tbl and policyname = p.name) then
      execute format('create policy %I on %I for %s %s %s', p.name, p.tbl, p.cmd,
        case when p.using_expr is not null then 'using (' || p.using_expr || ')' else '' end,
        case when p.check_expr is not null then 'with check (' || p.check_expr || ')' else '' end);
    end if;
  end loop;
end $$;

-- ===== 20261010000003_job_engine_seed.sql =====
-- Converted for AapStack (schema project_remotejobs) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.
-- Seed data: sources, exchange rates, categories. Generated by scripts/generate-seed-sql.ts — do not edit by hand.

-- Sources. Third-party sources ship with enabled = true only where terms were reviewed (2026-10-10);
-- Startup Jobs ships disabled until an admin reviews its MCP terms (see docs/SOURCES.md).
insert into job_sources (slug, name, source_type, base_url, api_url, rss_url, terms_url, enabled, attribution_required, attribution_text, allow_structured_data, rate_limit, min_interval_minutes, retention_days, full_feed, terms_verified_at, terms_notes, config) values
  ('himalayas', 'Himalayas', 'api', 'https://himalayas.app', 'https://himalayas.app/jobs/api', 'https://himalayas.app/jobs/rss', 'https://himalayas.app/api', true, true, 'Source: Himalayas', false,
   'No auth; max 20 jobs per request (cursor pagination); HTTP 429 when exceeded; data refreshed daily', 1380, 30, false, '2026-10-10',
   'Must link to the Himalayas job URL and name Himalayas as the source. Must NOT submit Himalayas jobs to third-party job sites (Google Jobs, LinkedIn, Jooble…) → no JobPosting structured data.',
   '{"max_pages": 15}'),
  ('jobicy', 'Jobicy', 'api', 'https://jobicy.com', 'https://jobicy.com/api/v2/remote-jobs', 'https://jobicy.com/jobs/feed', 'https://github.com/Jobicy/remote-jobs-api', true, true, 'Source: Jobicy', false,
   'No auth; poll at most once per hour (a few times per day recommended); count 1–200', 360, 30, false, '2026-10-10',
   'Keep Jobicy as the source and preserve the canonical job URL; do not present as own postings; sanitize jobDescription HTML; use taxonomy endpoints for geo/industry slugs.',
   '{"queries": [{"count": 100}, {"count": 50, "tag": "ai"}, {"count": 50, "geo": "apac"}]}'),
  ('remoteok', 'Remote OK', 'api', 'https://remoteok.com', 'https://remoteok.com/api', 'https://remoteok.com/remote-jobs.rss', 'https://remoteok.com/api', true, true, 'Source: Remote OK', false,
   'Free public JSON/RSS, no auth; poll politely', 360, 30, true, '2026-10-10',
   'Credit Remote OK and link back to each original job URL so candidates apply there. First array item is a legal notice.',
   '{}'),
  ('startupjobs', 'Startup Jobs', 'mcp', 'https://startup.jobs', 'https://api.startup.jobs/mcp', null, 'https://startup.jobs', false, true, 'Source: Startup Jobs', false,
   'MCP over Streamable HTTP; free tier 20 req/min, last 14 days; full access via marc@startup.jobs', 720, 14, false, null,
   'No REST/RSS documented; only an MCP endpoint. Review terms with Startup Jobs before enabling.',
   '{"queries": [{"remote": true}, {"remote": true, "keyword": "AI"}, {"remote": true, "country": "IN"}]}'),
  ('employer', 'Mana Kosamu Employer', 'employer', null, null, null, '/terms', true, false, 'Source: Mana Kosamu Employer', true,
   'n/a', 0, 60, false, null, 'Jobs posted directly by verified employers; moderated before publishing.', '{}'),
  ('manual', 'Mana Kosamu', 'manual', null, null, null, '/terms', true, false, 'Source: Mana Kosamu', true,
   'n/a', 0, 60, false, null, 'Jobs entered by the Mana Kosamu team (e.g. government notifications with official links).', '{}')
on conflict (slug) do nothing;

-- Approximate reference rates (INR per 1 unit). Update from the RBI reference rate in /admin/jobs.
insert into exchange_rates (currency, inr_per_unit, source) values
  ('INR', 1, 'fixed'), ('USD', 88.0, 'manual seed'), ('EUR', 101.5, 'manual seed'), ('GBP', 117.0, 'manual seed'),
  ('CAD', 63.5, 'manual seed'), ('AUD', 57.5, 'manual seed'), ('SGD', 68.0, 'manual seed'), ('AED', 24.0, 'manual seed'),
  ('CHF', 109.0, 'manual seed'), ('JPY', 0.59, 'manual seed'), ('BRL', 16.0, 'manual seed'), ('PLN', 23.5, 'manual seed'),
  ('SEK', 9.2, 'manual seed'), ('NZD', 52.0, 'manual seed'), ('ZAR', 4.9, 'manual seed'), ('MXN', 4.7, 'manual seed')
on conflict (currency) do nothing;

-- Category groups and categories
insert into job_categories (slug, name, name_te, parent_slug, kind, is_ai, sort_order, seo_enabled) values
  ('ai-ml', 'AI & Machine Learning', 'AI & మెషిన్ లెర్నింగ్', null, 'group', true, 0, true),
  ('software-development', 'Software Development', 'సాఫ్ట్‌వేర్ డెవలప్‌మెంట్', null, 'group', false, 100, true),
  ('creative', 'Creative', 'క్రియేటివ్', null, 'group', false, 200, true),
  ('business', 'Business', 'బిజినెస్', null, 'group', false, 300, true)
on conflict (slug) do update set name = excluded.name, name_te = excluded.name_te, kind = excluded.kind, is_ai = excluded.is_ai, sort_order = excluded.sort_order;
insert into job_categories (slug, name, name_te, parent_slug, kind, is_ai, sort_order, seo_enabled) values
  ('ai-engineering', 'AI Engineering', 'AI ఇంజనీరింగ్', 'ai-ml', 'field', true, 1, false),
  ('generative-ai', 'Generative AI', 'జనరేటివ్ AI', 'ai-ml', 'field', true, 2, true),
  ('llm', 'LLM', 'LLM', 'ai-ml', 'field', true, 3, true),
  ('prompt-engineering', 'Prompt Engineering', 'ప్రాంప్ట్ ఇంజనీరింగ్', 'ai-ml', 'field', true, 4, true),
  ('ai-agents', 'AI Agents', 'AI ఏజెంట్లు', 'ai-ml', 'field', true, 5, true),
  ('rag', 'RAG', 'RAG', 'ai-ml', 'field', true, 6, false),
  ('machine-learning', 'Machine Learning', 'మెషిన్ లెర్నింగ్', 'ai-ml', 'field', true, 7, true),
  ('deep-learning', 'Deep Learning', 'డీప్ లెర్నింగ్', 'ai-ml', 'field', true, 8, false),
  ('computer-vision', 'Computer Vision', 'కంప్యూటర్ విజన్', 'ai-ml', 'field', true, 9, false),
  ('nlp', 'NLP', 'NLP (భాషా ప్రాసెసింగ్)', 'ai-ml', 'field', true, 10, false),
  ('data-science', 'Data Science', 'డేటా సైన్స్', 'ai-ml', 'field', true, 11, true),
  ('data-engineering', 'Data Engineering', 'డేటా ఇంజనీరింగ్', 'ai-ml', 'field', false, 12, false),
  ('ai-automation', 'Automation', 'ఆటోమేషన్', 'ai-ml', 'field', true, 13, true),
  ('n8n', 'n8n', 'n8n', 'ai-ml', 'skill', true, 14, true),
  ('zapier', 'Zapier', 'Zapier', 'ai-ml', 'skill', false, 15, false),
  ('make', 'Make', 'Make', 'ai-ml', 'skill', false, 16, false),
  ('chatgpt', 'ChatGPT', 'ChatGPT', 'ai-ml', 'skill', true, 17, true),
  ('claude', 'Claude', 'Claude', 'ai-ml', 'skill', true, 18, true),
  ('gemini', 'Gemini', 'Gemini', 'ai-ml', 'skill', true, 19, false),
  ('copilot', 'Copilot', 'Copilot', 'ai-ml', 'skill', true, 20, false),
  ('web-development', 'Web Development', 'వెబ్ డెవలప్‌మెంట్', 'software-development', 'field', false, 121, false),
  ('python', 'Python', 'పైథాన్', 'software-development', 'skill', false, 122, true),
  ('java', 'Java', 'జావా', 'software-development', 'skill', false, 123, false),
  ('javascript', 'JavaScript', 'జావాస్క్రిప్ట్', 'software-development', 'skill', false, 124, false),
  ('typescript', 'TypeScript', 'టైప్‌స్క్రిప్ట్', 'software-development', 'skill', false, 125, false),
  ('react', 'React', 'React', 'software-development', 'skill', false, 126, true),
  ('nextjs', 'Next.js', 'Next.js', 'software-development', 'skill', false, 127, false),
  ('nodejs', 'Node.js', 'Node.js', 'software-development', 'skill', false, 128, false),
  ('dotnet', '.NET', '.NET', 'software-development', 'skill', false, 129, false),
  ('csharp', 'C#', 'C#', 'software-development', 'skill', false, 130, false),
  ('sql', 'SQL', 'SQL', 'software-development', 'skill', false, 131, true),
  ('azure', 'Azure', 'Azure', 'software-development', 'skill', false, 132, true),
  ('aws', 'AWS', 'AWS', 'software-development', 'skill', false, 133, true),
  ('gcp', 'GCP', 'GCP', 'software-development', 'skill', false, 134, false),
  ('devops', 'DevOps', 'DevOps', 'software-development', 'field', false, 135, true),
  ('kubernetes', 'Kubernetes', 'Kubernetes', 'software-development', 'skill', false, 136, false),
  ('terraform', 'Terraform', 'Terraform', 'software-development', 'skill', false, 137, false),
  ('video-editing', 'Video Editing', 'వీడియో ఎడిటింగ్', 'creative', 'field', false, 238, true),
  ('youtube', 'YouTube', 'యూట్యూబ్', 'creative', 'skill', false, 239, false),
  ('shorts', 'Shorts', 'Shorts', 'creative', 'skill', false, 240, false),
  ('reels', 'Reels', 'Reels', 'creative', 'skill', false, 241, false),
  ('graphic-design', 'Graphic Design', 'గ్రాఫిక్ డిజైన్', 'creative', 'field', false, 242, false),
  ('canva', 'Canva', 'Canva', 'creative', 'skill', false, 243, false),
  ('ai-image-generation', 'AI Image Generation', 'AI ఇమేజ్ జనరేషన్', 'creative', 'field', true, 244, false),
  ('ai-video', 'AI Video', 'AI వీడియో', 'creative', 'field', true, 245, false),
  ('virtual-assistant', 'Virtual Assistant', 'వర్చువల్ అసిస్టెంట్', 'business', 'field', false, 346, true),
  ('data-entry', 'Data Entry', 'డేటా ఎంట్రీ', 'business', 'field', false, 347, true),
  ('excel', 'Excel', 'ఎక్సెల్', 'business', 'skill', false, 348, false),
  ('power-bi', 'Power BI', 'Power BI', 'business', 'skill', false, 349, true),
  ('research', 'Research', 'రీసెర్చ్', 'business', 'field', false, 350, false),
  ('seo', 'SEO', 'SEO', 'business', 'field', false, 351, false),
  ('content-writing', 'Content Writing', 'కంటెంట్ రైటింగ్', 'business', 'field', false, 352, true),
  ('translation', 'Translation', 'అనువాదం', 'business', 'field', false, 353, false),
  ('customer-support', 'Customer Support', 'కస్టమర్ సపోర్ట్', 'business', 'field', false, 354, false)
on conflict (slug) do update set name = excluded.name, name_te = excluded.name_te, parent_slug = excluded.parent_slug, kind = excluded.kind, is_ai = excluded.is_ai, sort_order = excluded.sort_order;

-- ===== 20261014000001_more_job_sources.sql =====
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

-- ===== 20261014000002_affiliate_partners.sql =====
-- Converted for AapStack (schema project_remotejobs) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.
-- Affiliate partners: "Recommended tools" slots shown beside job listings.
-- Partner names/descriptions live in code (lib/affiliates/catalog.ts); this table only
-- holds the admin's own tracking links and on/off switches. Nothing shows until a link is pasted.

create table if not exists affiliate_partners (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  url text check (url is null or (url ~ '^https://' and char_length(url) <= 1000)),
  enabled boolean not null default false,
  placements text[],              -- null = catalog default placements
  note text check (char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table affiliate_partners enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = current_schema() and tablename = 'affiliate_partners' and policyname = 'affiliate_partners_public_read') then
    create policy affiliate_partners_public_read on affiliate_partners for select using (enabled and url is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = current_schema() and tablename = 'affiliate_partners' and policyname = 'affiliate_partners_admin_all') then
    create policy affiliate_partners_admin_all on affiliate_partners for all using (is_jobs_admin()) with check (is_jobs_admin());
  end if;
end $$;

insert into affiliate_partners (slug) values
  ('fiverr'), ('upwork'), ('freelancer'), ('coursera'), ('udemy'), ('upgrad'), ('canva'),
  ('hostinger'), ('payoneer'), ('wise'), ('flexjobs'), ('zety')
on conflict (slug) do nothing;

-- Allow the new analytics event (partner slug goes in filters->>'partner').
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'job_events'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%event_type%' loop
    execute format('alter table job_events drop constraint %I', c);
  end loop;
  alter table job_events add constraint job_events_event_type_check check (event_type in
    ('job_view','apply_click','save_job','share_job','report_job','search','filter_used','hide_job','affiliate_click'));
end $$;

create index if not exists job_events_affiliate_idx on job_events ((filters ->> 'partner'), created_at desc)
  where event_type = 'affiliate_click';

-- Clicks per partner and placement for the admin dashboard.
create or replace function admin_affiliate_clicks(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = project_remotejobs, public as $$
begin
  if not is_jobs_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(partner, jsonb_build_object('total', total, 'by_placement', by_placement))
    from (
      select partner, sum(n)::int as total, jsonb_object_agg(coalesce(section, 'other'), n) as by_placement
      from (
        select filters ->> 'partner' as partner, section, count(*)::int as n
        from job_events
        where event_type = 'affiliate_click' and filters ->> 'partner' is not null and created_at >= now() - make_interval(days => p_days)
        group by 1, 2
      ) s group by partner
    ) t
  ), '{}'::jsonb);
end $$;

-- ===== 20261014000003_districts.sql =====
-- Converted for AapStack (schema project_remotejobs) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.
-- AP / Telangana districts: jobs.district, backfill, district + state filters in search_jobs.
-- District list and matching rules live in supabase/functions/_shared/engine/districts.ts
-- (backfill patterns generated by scripts/gen-districts-sql.ts). New jobs get their district from the pipeline.

alter table jobs add column if not exists district text check (district is null or district ~ '^[a-z0-9-]{2,40}$');
create index if not exists jobs_district_idx on jobs (district) where is_active and district is not null;
create index if not exists jobs_state_idx on jobs (state) where is_active;

-- Backfill existing non-remote Indian jobs (localities first, then town names; longest pattern wins).
with patterns(slug, state, tier, re) as (values
  ('alluri-sitharama-raju', 'Andhra Pradesh', 2, '\m(alluri sitharama raju|paderu|araku)\M'),
  ('anakapalli', 'Andhra Pradesh', 2, '\m(anakapalli|anakapalle)\M'),
  ('ananthapuramu', 'Andhra Pradesh', 2, '\m(ananthapuramu|anantapur|anantapuram|ananthapur|guntakal|tadipatri)\M'),
  ('annamayya', 'Andhra Pradesh', 2, '\m(annamayya|madanapalle|madanapalli|rayachoti)\M'),
  ('bapatla', 'Andhra Pradesh', 2, '\m(bapatla|chirala)\M'),
  ('chittoor', 'Andhra Pradesh', 2, '\m(chittoor|kuppam)\M'),
  ('konaseema', 'Andhra Pradesh', 2, '\m(konaseema|amalapuram)\M'),
  ('east-godavari', 'Andhra Pradesh', 2, '\m(east godavari|rajahmundry|rajamahendravaram|rajamundry)\M'),
  ('eluru', 'Andhra Pradesh', 2, '\m(eluru|jangareddygudem)\M'),
  ('guntur', 'Andhra Pradesh', 2, '\m(guntur|tenali|mangalagiri|amaravati)\M'),
  ('kakinada', 'Andhra Pradesh', 2, '\m(kakinada|peddapuram|samalkot)\M'),
  ('krishna', 'Andhra Pradesh', 2, '\m(krishna district|machilipatnam|gudivada|gannavaram)\M'),
  ('kurnool', 'Andhra Pradesh', 2, '\m(kurnool|adoni)\M'),
  ('markapuram', 'Andhra Pradesh', 2, '\m(markapuram|markapur)\M'),
  ('nandyal', 'Andhra Pradesh', 2, '\m(nandyal)\M'),
  ('nellore', 'Andhra Pradesh', 2, '\m(nellore|kavali)\M'),
  ('ntr', 'Andhra Pradesh', 2, '\m(ntr district|vijayawada|bezawada|nandigama|jaggayyapeta)\M'),
  ('palnadu', 'Andhra Pradesh', 2, '\m(palnadu|narasaraopet|narasaraopeta|chilakaluripet)\M'),
  ('parvathipuram-manyam', 'Andhra Pradesh', 2, '\m(parvathipuram|parvathipuram manyam)\M'),
  ('polavaram', 'Andhra Pradesh', 2, '\m(polavaram|rampachodavaram)\M'),
  ('prakasam', 'Andhra Pradesh', 2, '\m(prakasam|ongole)\M'),
  ('srikakulam', 'Andhra Pradesh', 2, '\m(srikakulam)\M'),
  ('sri-sathya-sai', 'Andhra Pradesh', 2, '\m(sri sathya sai|puttaparthi|hindupur|dharmavaram)\M'),
  ('tirupati', 'Andhra Pradesh', 2, '\m(tirupati|tirupathi|srikalahasti|sri city)\M'),
  ('visakhapatnam', 'Andhra Pradesh', 2, '\m(visakhapatnam|vishakhapatnam|vishakapatnam|vizag|gajuwaka)\M'),
  ('vizianagaram', 'Andhra Pradesh', 2, '\m(vizianagaram|vizianagram)\M'),
  ('west-godavari', 'Andhra Pradesh', 2, '\m(west godavari|bhimavaram|palakollu|narsapur|narasapuram)\M'),
  ('ysr-kadapa', 'Andhra Pradesh', 2, '\m(kadapa|cuddapah|ysr kadapa|proddatur)\M'),
  ('adilabad', 'Telangana', 2, '\m(adilabad)\M'),
  ('bhadradri-kothagudem', 'Telangana', 2, '\m(kothagudem|bhadrachalam|bhadradri|paloncha)\M'),
  ('hanumakonda', 'Telangana', 2, '\m(hanumakonda|hanamkonda|kazipet)\M'),
  ('hyderabad', 'Telangana', 1, '\m(ameerpet|begumpet|banjara hills|jubilee hills|abids|himayatnagar|somajiguda|panjagutta|punjagutta|koti|nampally|mehdipatnam|tolichowki|khairatabad|masab tank|lakdikapul|charminar|musheerabad|amberpet)\M'),
  ('hyderabad', 'Telangana', 2, '\m(hyderabad|secunderabad)\M'),
  ('jagtial', 'Telangana', 2, '\m(jagtial|jagitial|korutla|metpally)\M'),
  ('jangaon', 'Telangana', 2, '\m(jangaon|jangoan|janagama)\M'),
  ('jayashankar-bhupalpally', 'Telangana', 2, '\m(bhupalpally|bhupalpalle|jayashankar)\M'),
  ('jogulamba-gadwal', 'Telangana', 2, '\m(gadwal|jogulamba)\M'),
  ('kamareddy', 'Telangana', 2, '\m(kamareddy|banswada)\M'),
  ('karimnagar', 'Telangana', 2, '\m(karimnagar|huzurabad)\M'),
  ('khammam', 'Telangana', 2, '\m(khammam|sathupalli)\M'),
  ('kumuram-bheem-asifabad', 'Telangana', 2, '\m(asifabad|kagaznagar|komaram bheem|kumuram bheem)\M'),
  ('mahabubabad', 'Telangana', 2, '\m(mahabubabad|mahbubabad)\M'),
  ('mahabubnagar', 'Telangana', 2, '\m(mahabubnagar|mahbubnagar|palamuru|jadcherla)\M'),
  ('mancherial', 'Telangana', 2, '\m(mancherial|bellampalli)\M'),
  ('medak', 'Telangana', 2, '\m(medak|toopran)\M'),
  ('medchal-malkajgiri', 'Telangana', 1, '\m(kukatpally|uppal|kompally|alwal|ecil|kapra|quthbullapur|bachupally|nizampet|boduppal|ghatkesar|keesara|jeedimetla|suchitra|pragathi nagar)\M'),
  ('medchal-malkajgiri', 'Telangana', 2, '\m(medchal|malkajgiri)\M'),
  ('mulugu', 'Telangana', 2, '\m(mulugu|eturnagaram)\M'),
  ('nagarkurnool', 'Telangana', 2, '\m(nagarkurnool|achampet|kalwakurthy)\M'),
  ('nalgonda', 'Telangana', 2, '\m(nalgonda|miryalaguda|devarakonda)\M'),
  ('narayanpet', 'Telangana', 2, '\m(narayanpet)\M'),
  ('nirmal', 'Telangana', 2, '\m(nirmal|bhainsa)\M'),
  ('nizamabad', 'Telangana', 2, '\m(nizamabad|bodhan|armoor)\M'),
  ('peddapalli', 'Telangana', 2, '\m(peddapalli|peddapalle|ramagundam|godavarikhani)\M'),
  ('rajanna-sircilla', 'Telangana', 2, '\m(sircilla|siricilla|vemulawada|rajanna)\M'),
  ('ranga-reddy', 'Telangana', 1, '\m(gachibowli|hitec city|hitech city|madhapur|kondapur|financial district|nanakramguda|manikonda|narsingi|kokapet|serilingampally|lb nagar|l\.b\. nagar|rajendranagar|attapur|hayathnagar|dilsukhnagar|vanasthalipuram|adibatla|kongara kalan)\M'),
  ('ranga-reddy', 'Telangana', 2, '\m(ranga reddy|rangareddy|shamshabad|ibrahimpatnam|chevella)\M'),
  ('sangareddy', 'Telangana', 1, '\m(ameenpur|ramachandrapuram|bhel)\M'),
  ('sangareddy', 'Telangana', 2, '\m(sangareddy|patancheru|zaheerabad|sadasivpet)\M'),
  ('siddipet', 'Telangana', 2, '\m(siddipet|gajwel)\M'),
  ('suryapet', 'Telangana', 2, '\m(suryapet|kodad|huzurnagar)\M'),
  ('vikarabad', 'Telangana', 2, '\m(vikarabad|tandur)\M'),
  ('wanaparthy', 'Telangana', 2, '\m(wanaparthy|wanaparthi)\M'),
  ('warangal', 'Telangana', 2, '\m(warangal|narsampet)\M'),
  ('yadadri-bhuvanagiri', 'Telangana', 2, '\m(bhongir|bhuvanagiri|yadadri|yadagirigutta|choutuppal)\M')

),
hit as (
  select distinct on (j.id) j.id, p.slug, p.state
  from jobs j
  join patterns p on (coalesce(j.city, '') || ' ' || coalesce(j.location_text, '')) ~* p.re
  where j.district is null and j.work_mode <> 'remote' and (j.country is null or j.country = 'IN')
  order by j.id, p.tier, length(p.re) desc
)
update jobs j set district = hit.slug, state = coalesce(j.state, hit.state)
from hit where j.id = hit.id;

create or replace function job_card_json(j jobs)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', j.id, 'slug', j.slug, 'title', j.title, 'company_name', j.company_name, 'company_logo', j.company_logo,
    'short_description', j.short_description, 'category', j.category, 'subcategory', j.subcategory,
    'employment_type', j.employment_type, 'work_mode', j.work_mode, 'country', j.country, 'city', j.city, 'district', j.district, 'state', j.state, 'location_text', j.location_text,
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


drop function if exists search_jobs(text, text[], text, text, text[], text[], text[], integer, text[], text[], text[], numeric, text[], text[], integer, text[], text, uuid[], text, integer, integer);

create or replace function search_jobs(
  p_query text default null,
  p_sections text[] default null,
  p_india_mode text default null,
  p_country text default null,
  p_regions text[] default null,
  p_categories text[] default null,
  p_ai_categories text[] default null,
  p_ai_min integer default null,
  p_employment_types text[] default null,
  p_work_modes text[] default null,
  p_seniority text[] default null,
  p_salary_min_inr numeric default null,
  p_budget_types text[] default null,
  p_durations text[] default null,
  p_posted_within_days integer default null,
  p_sources text[] default null,
  p_city text default null,
  p_district text default null,
  p_state text default null,
  p_exclude_ids uuid[] default null,
  p_sort text default 'relevance',
  p_limit integer default 20,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security invoker set search_path = project_remotejobs, public as $$
declare
  v_q text := nullif(btrim(p_query), '');
  v_tsq tsquery;
  v_result jsonb;
begin
  if v_q is not null then
    v_tsq := websearch_to_tsquery('english', v_q) || websearch_to_tsquery('simple', v_q);
    if v_tsq::text = '' then v_tsq := null; end if;
  end if;

  with matched as (
    select j, case when v_tsq is not null then ts_rank_cd(j.search_vector, v_tsq, 32) else 0 end as rank
    from jobs j
    where j.is_active and j.moderation_status = 'approved'
      and (j.expires_at is null or j.expires_at > now())
      and (v_q is null or (v_tsq is not null and j.search_vector @@ v_tsq) or j.title ilike '%' || v_q || '%' or j.company_name ilike '%' || v_q || '%')
      and (p_sections is null or j.sections @> p_sections)
      and india_mode_match(p_india_mode, j.india_eligibility)
      and (p_country is null or j.country = p_country or p_country = any (j.eligible_countries))
      and (p_regions is null or j.eligible_regions && p_regions or ('worldwide' = any (p_regions) and j.remote_worldwide))
      and (p_categories is null or j.category = any (p_categories) or j.subcategory = any (p_categories) or j.keywords && p_categories)
      and (p_ai_categories is null or j.ai_category = any (p_ai_categories) or j.keywords && p_ai_categories)
      and (p_ai_min is null or j.ai_score >= p_ai_min)
      and (p_employment_types is null or j.employment_type = any (p_employment_types))
      and (p_work_modes is null or j.work_mode = any (p_work_modes))
      and (p_seniority is null or j.seniority = any (p_seniority))
      and (p_salary_min_inr is null or j.salary_inr_annual_max >= p_salary_min_inr)
      and (p_budget_types is null or j.budget_type = any (p_budget_types))
      and (p_durations is null or j.job_duration = any (p_durations))
      and (p_posted_within_days is null or j.posted_at >= now() - make_interval(days => p_posted_within_days))
      and (p_sources is null or exists (select 1 from job_sources s where s.id = j.source_id and s.slug = any (p_sources)))
      and (p_city is null or j.city ilike p_city)
      and (p_district is null or j.district = p_district)
      and (p_state is null or (p_state = 'all_india' and j.state is null and j.country = 'IN') or j.state = p_state)
      and (p_exclude_ids is null or not (j.id = any (p_exclude_ids)))
  ),
  page as (
    select m.j, m.rank from matched m
    order by
      case when p_sort = 'salary' then (m.j).salary_inr_annual_max end desc nulls last,
      case when p_sort = 'relevance' and v_tsq is not null then m.rank end desc nulls last,
      (m.j).is_featured desc,
      (m.j).posted_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'items', coalesce((select jsonb_agg(job_card_json(p.j) order by
        case when p_sort = 'salary' then (p.j).salary_inr_annual_max end desc nulls last,
        case when p_sort = 'relevance' and v_tsq is not null then p.rank end desc nulls last,
        (p.j).is_featured desc, (p.j).posted_at desc) from page p), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;


-- ===== 20261014000004_employer_ats_sources.sql =====
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

-- ===== 20261015000001_subscriptions_devices.sql =====
-- Converted for AapStack (schema project_remotejobs) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.
-- Subscription access + one device per account.
--   * app_settings.access: mode ('subscription' | 'open'), trial_days, device_change_cooldown_days
--   * subscription_plans: prices shown on /subscribe; each maps to a Razorpay plan id
--   * subscriptions: trial / razorpay / admin-granted access periods (access while current_end > now())
--   * user_devices: the single device bound to each account (only a hash of the device id is stored)
-- Job data (jobs, source links, AI summaries) is readable only with access: has_job_access().
-- Set mode to 'open' to return to a free, public site (also set ACCESS_MODE=open for the Next.js app).

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into app_settings (key, value) values
  ('access', '{"mode": "subscription", "trial_days": 3, "device_change_cooldown_days": 30}')
on conflict (key) do nothing;

create table if not exists subscription_plans (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  name_te text,
  price_inr integer not null check (price_inr > 0),
  interval_months integer not null check (interval_months between 1 and 24),
  razorpay_plan_id text check (razorpay_plan_id is null or razorpay_plan_id ~ '^plan_[A-Za-z0-9]+$'),
  total_count integer not null default 60 check (total_count between 1 and 1200),
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into subscription_plans (id, name, name_te, price_inr, interval_months, sort_order) values
  ('monthly', 'Monthly', 'నెలవారీ', 49, 1, 1),
  ('quarterly', '3 months', '3 నెలలు', 129, 3, 2),
  ('yearly', '12 months', '12 నెలలు', 399, 12, 3)
on conflict (id) do nothing;

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text references subscription_plans (id) on delete set null,
  provider text not null check (provider in ('trial', 'razorpay', 'admin')),
  provider_subscription_id text unique,
  status text not null default 'created',
  current_start timestamptz,
  current_end timestamptz,
  cancel_at_period_end boolean not null default false,
  short_url text,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on subscriptions (user_id, current_end desc);
-- One trial per account, ever.
create unique index if not exists subscriptions_one_trial on subscriptions (user_id) where provider = 'trial';

create table if not exists subscription_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text unique,
  event text not null,
  provider_subscription_id text,
  payload jsonb not null,
  processed boolean not null default false,
  error text,
  received_at timestamptz not null default now()
);

create table if not exists user_devices (
  user_id uuid primary key references auth.users (id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  device_label text check (char_length(device_label) <= 120),
  bound_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  changed_count integer not null default 0,
  last_changed_at timestamptz
);

-- ---------------------------------------------------------------- access helpers

create or replace function access_settings()
returns jsonb language sql stable security definer set search_path = project_remotejobs, public as $$
  select coalesce((select value from app_settings where key = 'access'),
                  '{"mode": "subscription", "trial_days": 0, "device_change_cooldown_days": 30}'::jsonb)
$$;

create or replace function access_until(p_user uuid)
returns timestamptz language sql stable security definer set search_path = project_remotejobs, public as $$
  select max(current_end) from subscriptions
  where user_id = p_user and status not in ('created') and current_end is not null
$$;

/** True when the caller may read job data. */
create or replace function has_job_access()
returns boolean language sql stable security definer set search_path = project_remotejobs, public as $$
  select coalesce(auth.role(), '') = 'service_role'
      or access_settings() ->> 'mode' = 'open'
      or is_jobs_admin()
      or coalesce(access_until(auth.uid()) > now(), false)
$$;

/** What the app needs to decide where to send a signed-in user. */
create or replace function access_status(p_device_hash text)
returns jsonb language plpgsql stable security definer set search_path = project_remotejobs, public as $$
declare
  v_uid uuid := auth.uid();
  d user_devices;
  s jsonb := access_settings();
begin
  if v_uid is null then return jsonb_build_object('signed_in', false, 'mode', s ->> 'mode'); end if;
  select * into d from user_devices where user_id = v_uid;
  return jsonb_build_object(
    'signed_in', true,
    'mode', s ->> 'mode',
    'admin', is_jobs_admin(),
    'device', case when d.user_id is null then 'none' when d.device_hash = p_device_hash then 'match' else 'other' end,
    'device_label', d.device_label,
    'bound_at', d.bound_at,
    'access_until', access_until(v_uid),
    'trial_used', exists (select 1 from subscriptions where user_id = v_uid and provider = 'trial'),
    'can_move_device_at', case when d.last_changed_at is null then d.bound_at
                               else d.last_changed_at + make_interval(days => coalesce((s ->> 'device_change_cooldown_days')::int, 30)) end
  );
end $$;

/** Binds this device on first sign-in (and starts the free trial once); never replaces another device. */
create or replace function bind_device(p_device_hash text, p_label text default null)
returns jsonb language plpgsql security definer set search_path = project_remotejobs, public as $$
declare
  v_uid uuid := auth.uid();
  s jsonb := access_settings();
  v_trial int := coalesce((s ->> 'trial_days')::int, 0);
  d user_devices;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_device_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad device id' using errcode = '22023'; end if;
  -- Hosts that can't run a trigger on auth.users (e.g. AapStack) get the profile row here, at first sign-in.
  insert into profiles (id, phone) select u.id, u.phone from auth.users u where u.id = v_uid on conflict (id) do nothing;
  select * into d from user_devices where user_id = v_uid for update;
  if d.user_id is null then
    insert into user_devices (user_id, device_hash, device_label) values (v_uid, p_device_hash, left(p_label, 120));
    if s ->> 'mode' = 'subscription' and v_trial > 0 then
      insert into subscriptions (user_id, provider, status, current_start, current_end, note)
      values (v_uid, 'trial', 'trial', now(), now() + make_interval(days => v_trial), 'Free trial')
      on conflict do nothing;
    end if;
  elsif d.device_hash = p_device_hash then
    update user_devices set last_seen_at = now(), device_label = coalesce(left(p_label, 120), device_label) where user_id = v_uid;
  end if;
  return access_status(p_device_hash);
end $$;

/** Moves the account to this device, at most once per cooldown period (the old device loses access). */
create or replace function move_device(p_device_hash text, p_label text default null)
returns jsonb language plpgsql security definer set search_path = project_remotejobs, public as $$
declare
  v_uid uuid := auth.uid();
  v_next timestamptz;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_device_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad device id' using errcode = '22023'; end if;
  v_next := (access_status(p_device_hash) ->> 'can_move_device_at')::timestamptz;
  if v_next is not null and v_next > now() then
    raise exception 'device change allowed after %', to_char(v_next at time zone 'Asia/Kolkata', 'DD Mon YYYY') using errcode = 'P0001';
  end if;
  update user_devices
     set device_hash = p_device_hash, device_label = left(p_label, 120), bound_at = now(), last_seen_at = now(),
         changed_count = changed_count + 1, last_changed_at = now()
   where user_id = v_uid;
  return access_status(p_device_hash);
end $$;

revoke execute on function access_until(uuid) from public, anon, authenticated;
grant execute on function access_until(uuid) to service_role;
revoke execute on function bind_device(text, text) from anon;
revoke execute on function move_device(text, text) from anon;

-- ---------------------------------------------------------------- RLS

alter table app_settings enable row level security;
alter table subscription_plans enable row level security;
alter table subscriptions enable row level security;
alter table subscription_events enable row level security;
alter table user_devices enable row level security;

do $$
declare p record;
begin
  for p in select * from (values
    ('app_settings', 'app_settings_public_read', 'select', 'true', null),
    ('app_settings', 'app_settings_admin_write', 'all', 'is_jobs_admin()', 'is_jobs_admin()'),
    ('subscription_plans', 'subscription_plans_public_read', 'select', 'active', null),
    ('subscription_plans', 'subscription_plans_admin_all', 'all', 'is_jobs_admin()', 'is_jobs_admin()'),
    ('subscriptions', 'subscriptions_owner_read', 'select', 'user_id = auth.uid()', null),
    ('subscriptions', 'subscriptions_admin_all', 'all', 'is_jobs_admin()', 'is_jobs_admin()'),
    ('subscription_events', 'subscription_events_admin_read', 'select', 'is_jobs_admin()', null),
    ('user_devices', 'user_devices_owner_read', 'select', 'user_id = auth.uid()', null),
    ('user_devices', 'user_devices_admin_all', 'all', 'is_jobs_admin()', 'is_jobs_admin()')
  ) as t(tbl, name, cmd, using_expr, check_expr) loop
    if not exists (select 1 from pg_policies where schemaname = current_schema() and tablename = p.tbl and policyname = p.name) then
      execute format('create policy %I on %I for %s %s %s', p.name, p.tbl, p.cmd,
        case when p.using_expr is not null then 'using (' || p.using_expr || ')' else '' end,
        case when p.check_expr is not null then 'with check (' || p.check_expr || ')' else '' end);
    end if;
  end loop;
end $$;

-- Job data now needs access. `(select …)` lets Postgres evaluate the check once per query.
drop policy if exists jobs_public_read on jobs;
create policy jobs_public_read on jobs for select
  using (is_active and moderation_status = 'approved' and (select has_job_access()));
drop policy if exists job_sources_mapping_public_read on job_sources_mapping;
create policy job_sources_mapping_public_read on job_sources_mapping for select using ((select has_job_access()));
drop policy if exists job_ai_summaries_public_read on job_ai_summaries;
create policy job_ai_summaries_public_read on job_ai_summaries for select using ((select has_job_access()));

-- Job alerts only notify people who currently have access.
create or replace function process_job_alerts()
returns integer language plpgsql security definer set search_path = project_remotejobs, public as $$
declare a record; v_total integer := 0; v_n integer; v_started timestamptz := now();
begin
  for a in select al.* from job_alerts al
           where al.is_active
             and (access_settings() ->> 'mode' = 'open'
                  or coalesce(access_until(al.user_id) > now(), false)
                  or exists (select 1 from profiles p where p.id = al.user_id and p.role in ('admin', 'moderator'))) loop
    insert into job_notifications (user_id, alert_id, job_id, title, body, url)
    select a.user_id, a.id, j.id, j.title,
           j.company_name || ' · ' || case when j.work_mode = 'remote' then 'Remote' else coalesce(j.city, '') end,
           '/jobs/' || j.slug
    from jobs j
    where j.is_active and j.moderation_status = 'approved'
      and coalesce(j.published_at, j.created_at) > a.last_checked_at
      and (a.keywords is null or btrim(a.keywords) = '' or j.search_vector @@ (websearch_to_tsquery('english', a.keywords) || websearch_to_tsquery('simple', a.keywords)))
      and (a.category is null or j.category = a.category or j.subcategory = a.category or a.category = any (j.keywords))
      and (a.country is null or a.country = any (j.eligible_countries) or j.country = a.country or j.remote_worldwide)
      and (not a.remote_only or j.work_mode = 'remote')
      and (not a.ai_only or j.ai_score >= 40)
      and (not a.freelance_only or 'freelance' = any (j.sections))
      and india_mode_match(a.india_mode, j.india_eligibility)
      and (a.salary_min_inr is null or j.salary_inr_annual_max >= a.salary_min_inr)
      and (cardinality(a.employment_types) = 0 or j.employment_type = any (a.employment_types))
      and not exists (select 1 from hidden_jobs h where h.user_id = a.user_id and h.job_id = j.id)
    order by j.posted_at desc
    limit 20
    on conflict (alert_id, job_id) do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    update job_alerts set last_checked_at = v_started where id = a.id;
  end loop;
  insert into job_sync_logs (kind, status, started_at, completed_at, jobs_added)
  values ('alerts', 'success', v_started, now(), v_total);
  return v_total;
end $$;
revoke execute on function process_job_alerts() from public, anon, authenticated;

-- ===== 20261016000001_board_sources_off_until_configured.sql =====
-- Converted for AapStack (schema project_remotejobs) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.
-- Greenhouse and Lever only fetch the company boards an admin lists. With no boards a run has nothing
-- to do, so keep them switched off until boards are saved (saving boards in /admin/jobs switches them on).
update job_sources set enabled = false
where slug in ('greenhouse', 'lever') and coalesce(jsonb_array_length(config -> 'boards'), 0) = 0;

-- ===== 20261016000002_jobicy_ai_tag.sql =====
-- Converted for AapStack (schema project_remotejobs) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.
-- Jobicy rejects tags shorter than 3 characters ("ai" → HTTP 400), which pushed every Jobicy run to the RSS
-- fallback. Search AI jobs with a longer tag instead.
update job_sources
set config = jsonb_set(config, '{queries}', (
  select coalesce(jsonb_agg(case when q ->> 'tag' = 'ai' then q || '{"tag": "artificial intelligence"}' else q end), '[]'::jsonb)
  from jsonb_array_elements(config -> 'queries') q))
where slug = 'jobicy' and config ? 'queries';

-- ===== 20261017000001_wwr_jooble_ashby_sources.sql =====
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

-- ===== 20261017000002_email_login.sql =====
-- Converted for AapStack (schema project_remotejobs) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.
-- Testing option: sign up / sign in with email + password next to mobile OTP.
-- Switched on in /admin/subscribers ("Allow email + password sign-in", stored as app_settings.access.email_login)
-- or with EMAIL_LOGIN=on in the website env. Email accounts follow the same rules: one device, trial, plan.

alter table profiles add column if not exists email text;
create index if not exists profiles_email_idx on profiles (lower(email));

-- Profile gets the phone or the email of the auth user (phone may be '' for email accounts).
create or replace function mk_jobs_handle_new_user()
returns trigger language plpgsql security definer set search_path = project_remotejobs, public as $$
begin
  insert into profiles (id, phone, email, display_name)
  values (new.id, nullif(new.phone, ''), nullif(lower(new.email), ''), coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function bind_device(p_device_hash text, p_label text default null)
returns jsonb language plpgsql security definer set search_path = project_remotejobs, public as $$
declare
  v_uid uuid := auth.uid();
  s jsonb := access_settings();
  v_trial int := coalesce((s ->> 'trial_days')::int, 0);
  d user_devices;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_device_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad device id' using errcode = '22023'; end if;
  -- Hosts that can't run a trigger on auth.users (e.g. AapStack) get the profile row here, at first sign-in.
  insert into profiles (id, phone, email)
    select u.id, nullif(u.phone, ''), nullif(lower(u.email), '') from auth.users u where u.id = v_uid
  on conflict (id) do update set
    phone = coalesce(profiles.phone, excluded.phone),
    email = coalesce(profiles.email, excluded.email);
  select * into d from user_devices where user_id = v_uid for update;
  if d.user_id is null then
    insert into user_devices (user_id, device_hash, device_label) values (v_uid, p_device_hash, left(p_label, 120));
    if s ->> 'mode' = 'subscription' and v_trial > 0 then
      insert into subscriptions (user_id, provider, status, current_start, current_end, note)
      values (v_uid, 'trial', 'trial', now(), now() + make_interval(days => v_trial), 'Free trial')
      on conflict do nothing;
    end if;
  elsif d.device_hash = p_device_hash then
    update user_devices set last_seen_at = now(), device_label = coalesce(left(p_label, 120), device_label) where user_id = v_uid;
  end if;
  return access_status(p_device_hash);
end $$;

revoke execute on function bind_device(text, text) from anon;

-- ===== 20261017000003_smart_search_rag.sql =====
-- Converted for AapStack (schema project_remotejobs) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.
-- Smart search + jobs assistant (RAG).
--  • jobs.embedding: meaning vector of each job (1024 numbers; Voyage voyage-4-lite or OpenAI text-embedding-3-small
--    at 1024 dims), filled every 30 min by the embed-jobs function. NULL until an embeddings key is set.
--  • search_jobs(..., p_embedding): when the website sends the query's vector, results that match by meaning are
--    included and ranking mixes keyword + meaning. Without it, search is exactly as before.
--  • ai_usage / take_ai_quota: per-user daily limit for the assistant (app_settings 'ai').

-- extension vector: enable it in AapStack → Database → Extensions (installed in public)

alter table jobs add column if not exists embedding public.vector(1024);
alter table jobs add column if not exists embedding_hash text;
alter table jobs add column if not exists embedded_at timestamptz;

-- Settings: daily questions per user, minimum similarity for meaning-only matches, assistant on/off.
insert into app_settings (key, value) values ('ai', '{"assistant": true, "daily_questions": 20, "min_similarity": 0.4}'::jsonb)
on conflict (key) do nothing;

create or replace function ai_settings()
returns jsonb language sql stable security definer set search_path = project_remotejobs, public as $$
  select coalesce((select value from app_settings where key = 'ai'), '{"assistant": true, "daily_questions": 20, "min_similarity": 0.4}'::jsonb)
$$;

-- What the embeddings worker should (re)embed: active jobs with no vector or whose text changed.
create or replace function embedding_text(j jobs)
returns text language sql immutable set search_path = project_remotejobs, public as $$
  select left(concat_ws(E'\n',
    j.title,
    'Company: ' || j.company_name,
    'Type: ' || replace(j.employment_type, '_', ' ') || ', ' || j.work_mode,
    'Location: ' || coalesce(nullif(j.location_text, ''), concat_ws(', ', j.city, j.state, j.country)),
    case when j.india_eligibility in ('explicit','worldwide','region','timezone') then 'Open to applicants in India' end,
    'Skills: ' || nullif(array_to_string(j.skills, ', '), ''),
    'Category: ' || concat_ws(', ', j.category, j.ai_category),
    left(coalesce(j.description, j.short_description, ''), 2000)
  ), 3000)
$$;

create or replace function jobs_needing_embedding(p_limit integer default 64)
returns table (id uuid, content text, content_hash text)
language sql stable security definer set search_path = project_remotejobs, public as $$
  select j.id, embedding_text(j), md5(embedding_text(j))
  from jobs j
  where j.is_active and j.moderation_status = 'approved'
    and (j.embedding is null or j.embedding_hash is distinct from md5(embedding_text(j)))
  order by j.posted_at desc
  limit least(greatest(coalesce(p_limit, 64), 1), 256)
$$;

-- p_rows: JSON text [{"id": "…", "embedding": "[…]", "hash": "…"}] (text so every REST engine passes it through).
create or replace function set_job_embeddings(p_rows text)
returns integer language plpgsql security definer set search_path = project_remotejobs, public as $$
declare r jsonb; n integer := 0;
begin
  for r in select * from jsonb_array_elements(p_rows::jsonb) loop
    update jobs set embedding = (r ->> 'embedding')::public.vector(1024), embedding_hash = r ->> 'hash', embedded_at = now()
    where id = (r ->> 'id')::uuid;
    n := n + found::int;
  end loop;
  return n;
end $$;

revoke execute on function jobs_needing_embedding(integer) from public, anon, authenticated;
revoke execute on function set_job_embeddings(text) from public, anon, authenticated;

-- Daily assistant quota (admins unlimited).
create table if not exists ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  questions integer not null default 0,
  primary key (user_id, day)
);
alter table ai_usage enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = current_schema() and tablename = 'ai_usage' and policyname = 'ai_usage_owner_read') then
    create policy ai_usage_owner_read on ai_usage for select using (user_id = auth.uid());
  end if;
end $$;

create or replace function take_ai_quota()
returns jsonb language plpgsql security definer set search_path = project_remotejobs, public as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := coalesce((ai_settings() ->> 'daily_questions')::int, 20);
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_used integer;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if is_jobs_admin() then return jsonb_build_object('allowed', true, 'used', 0, 'limit', null); end if;
  insert into ai_usage (user_id, day, questions) values (v_uid, v_day, 1)
  on conflict (user_id, day) do update set questions = ai_usage.questions + 1
  where ai_usage.questions < v_limit
  returning questions into v_used;
  if v_used is null then
    return jsonb_build_object('allowed', false, 'used', v_limit, 'limit', v_limit);
  end if;
  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit);
end $$;
revoke execute on function take_ai_quota() from public, anon;

-- search_jobs gains p_embedding (the old signature is replaced).
drop function if exists search_jobs(text, text[], text, text, text[], text[], text[], integer, text[], text[], text[], numeric, text[], text[], integer, text[], text, text, text, uuid[], text, integer, integer);

create or replace function search_jobs(
  p_query text default null,
  p_sections text[] default null,
  p_india_mode text default null,
  p_country text default null,
  p_regions text[] default null,
  p_categories text[] default null,
  p_ai_categories text[] default null,
  p_ai_min integer default null,
  p_employment_types text[] default null,
  p_work_modes text[] default null,
  p_seniority text[] default null,
  p_salary_min_inr numeric default null,
  p_budget_types text[] default null,
  p_durations text[] default null,
  p_posted_within_days integer default null,
  p_sources text[] default null,
  p_city text default null,
  p_district text default null,
  p_state text default null,
  p_exclude_ids uuid[] default null,
  p_sort text default 'relevance',
  p_limit integer default 20,
  p_offset integer default 0,
  p_embedding text default null
) returns jsonb
language plpgsql stable security invoker set search_path = project_remotejobs, public as $$
declare
  v_q text := nullif(btrim(p_query), '');
  v_tsq tsquery;
  v_result jsonb;
  -- Smart search: the website sends the query's embedding ("[0.1,…]", 1024 numbers) when it has one.
  v_emb public.vector(1024) := case when p_embedding ~ '^\[[-0-9.eE, ]+\]$' then p_embedding::public.vector(1024) end;
  v_min_sim double precision := coalesce((ai_settings() ->> 'min_similarity')::double precision, 0.4);
begin
  if v_q is not null then
    v_tsq := websearch_to_tsquery('english', v_q) || websearch_to_tsquery('simple', v_q);
    if v_tsq::text = '' then v_tsq := null; end if;
  end if;

  with matched as (
    select j,
      case when v_tsq is not null then least(ts_rank_cd(j.search_vector, v_tsq, 32), 1) else 0 end
      + case when v_emb is not null and j.embedding is not null then (1 - (j.embedding <=> v_emb)) * 2 else 0 end
      + case when v_q is not null and j.title ilike '%' || v_q || '%' then 0.3 else 0 end as rank
    from jobs j
    where j.is_active and j.moderation_status = 'approved'
      and (j.expires_at is null or j.expires_at > now())
      and (v_q is null or (v_tsq is not null and j.search_vector @@ v_tsq) or j.title ilike '%' || v_q || '%' or j.company_name ilike '%' || v_q || '%'
           or (v_emb is not null and j.embedding is not null and 1 - (j.embedding <=> v_emb) >= v_min_sim))
      and (p_sections is null or j.sections @> p_sections)
      and india_mode_match(p_india_mode, j.india_eligibility)
      and (p_country is null or j.country = p_country or p_country = any (j.eligible_countries))
      and (p_regions is null or j.eligible_regions && p_regions or ('worldwide' = any (p_regions) and j.remote_worldwide))
      and (p_categories is null or j.category = any (p_categories) or j.subcategory = any (p_categories) or j.keywords && p_categories)
      and (p_ai_categories is null or j.ai_category = any (p_ai_categories) or j.keywords && p_ai_categories)
      and (p_ai_min is null or j.ai_score >= p_ai_min)
      and (p_employment_types is null or j.employment_type = any (p_employment_types))
      and (p_work_modes is null or j.work_mode = any (p_work_modes))
      and (p_seniority is null or j.seniority = any (p_seniority))
      and (p_salary_min_inr is null or j.salary_inr_annual_max >= p_salary_min_inr)
      and (p_budget_types is null or j.budget_type = any (p_budget_types))
      and (p_durations is null or j.job_duration = any (p_durations))
      and (p_posted_within_days is null or j.posted_at >= now() - make_interval(days => p_posted_within_days))
      and (p_sources is null or exists (select 1 from job_sources s where s.id = j.source_id and s.slug = any (p_sources)))
      and (p_city is null or j.city ilike p_city)
      and (p_district is null or j.district = p_district)
      and (p_state is null or (p_state = 'all_india' and j.state is null and j.country = 'IN') or j.state = p_state)
      and (p_exclude_ids is null or not (j.id = any (p_exclude_ids)))
  ),
  page as (
    select m.j, m.rank from matched m
    order by
      case when p_sort = 'salary' then (m.j).salary_inr_annual_max end desc nulls last,
      case when p_sort = 'relevance' and (v_tsq is not null or v_emb is not null) then m.rank end desc nulls last,
      (m.j).is_featured desc,
      (m.j).posted_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'items', coalesce((select jsonb_agg(job_card_json(p.j) order by
        case when p_sort = 'salary' then (p.j).salary_inr_annual_max end desc nulls last,
        case when p_sort = 'relevance' and (v_tsq is not null or v_emb is not null) then p.rank end desc nulls last,
        (p.j).is_featured desc, (p.j).posted_at desc) from page p), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

