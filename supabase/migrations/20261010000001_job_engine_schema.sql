-- Mana Kosamu — Remote + AI + Freelance Job Engine: core schema
-- Safe to run on an existing Mana Kosamu database: every object is created
-- "if not exists" and existing tables are extended with "add column if not exists".

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ── Profiles (reuse the app's table if it exists; add the columns we need) ───
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists preferred_language text not null default 'en';
alter table public.profiles add column if not exists home_city text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
do $$ begin
  alter table public.profiles add constraint profiles_role_check check (role in ('user','employer','moderator','admin'));
exception when duplicate_object then null; end $$;

create or replace function public.mk_jobs_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, display_name)
  values (new.id, new.phone, coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists mk_jobs_on_auth_user_created on auth.users;
create trigger mk_jobs_on_auth_user_created after insert on auth.users
  for each row execute function public.mk_jobs_handle_new_user();

create or replace function public.is_jobs_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator'));
$$;

-- ── Sources ─────────────────────────────────────────────────────────────────
create table if not exists public.job_sources (
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
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Columns are added individually so an existing `jobs` table is extended, not replaced.
alter table public.jobs
  add column if not exists slug text,
  add column if not exists source_id uuid references public.job_sources (id) on delete set null,
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
    if not exists (select 1 from pg_constraint where conname = r.name and conrelid = 'public.jobs'::regclass) then
      execute format('alter table public.jobs add constraint %I %s', r.name, r.def);
    end if;
  end loop;
end $$;

create unique index if not exists jobs_slug_key on public.jobs (slug);
create unique index if not exists jobs_source_job_key on public.jobs (source_id, source_job_id);
create index if not exists jobs_active_posted_idx on public.jobs (posted_at desc) where is_active;
create index if not exists jobs_sections_idx on public.jobs using gin (sections);
create index if not exists jobs_keywords_idx on public.jobs using gin (keywords);
create index if not exists jobs_eligible_countries_idx on public.jobs using gin (eligible_countries);
create index if not exists jobs_search_idx on public.jobs using gin (search_vector);
create index if not exists jobs_title_trgm_idx on public.jobs using gin (title extensions.gin_trgm_ops);
create index if not exists jobs_content_hash_idx on public.jobs (content_hash);
create index if not exists jobs_canonical_url_idx on public.jobs (canonical_url);
create index if not exists jobs_normalized_company_idx on public.jobs (normalized_company);
create index if not exists jobs_india_idx on public.jobs (india_eligibility) where is_active;
create index if not exists jobs_ai_score_idx on public.jobs (ai_score desc) where is_active;
create index if not exists jobs_moderation_idx on public.jobs (moderation_status, risk_level);
create index if not exists jobs_expires_idx on public.jobs (expires_at) where is_active and expires_at is not null;

create or replace function public.jobs_before_write()
returns trigger language plpgsql set search_path = public, extensions as $$
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

drop trigger if exists jobs_before_write on public.jobs;
create trigger jobs_before_write before insert or update on public.jobs
  for each row execute function public.jobs_before_write();

-- ── Cross-source mapping (dedupe) ───────────────────────────────────────────
create table if not exists public.job_sources_mapping (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  source_id uuid not null references public.job_sources (id) on delete cascade,
  external_job_id text not null,
  external_url text not null,
  is_primary boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source_id, external_job_id)
);
create index if not exists job_sources_mapping_job_idx on public.job_sources_mapping (job_id);

create or replace function public.job_mapping_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_job uuid := coalesce(new.job_id, old.job_id);
begin
  update public.jobs set source_count = greatest(1, (select count(*) from public.job_sources_mapping where job_id = v_job))
  where id = v_job;
  return null;
end $$;
drop trigger if exists job_mapping_count on public.job_sources_mapping;
create trigger job_mapping_count after insert or delete on public.job_sources_mapping
  for each row execute function public.job_mapping_count();

-- ── Categories ──────────────────────────────────────────────────────────────
create table if not exists public.job_categories (
  slug text primary key,
  name text not null,
  name_te text,
  parent_slug text references public.job_categories (slug) on delete set null,
  kind text not null default 'field' check (kind in ('group','field','skill')),
  is_ai boolean not null default false,
  sort_order integer not null default 0,
  seo_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Exchange rates (controlled, admin-editable) ─────────────────────────────
create table if not exists public.exchange_rates (
  currency text primary key check (currency ~ '^[A-Z]{3}$'),
  inr_per_unit numeric(14, 6) not null check (inr_per_unit > 0),
  source text not null default 'manual',
  updated_at timestamptz not null default now()
);

-- ── Sync logs ───────────────────────────────────────────────────────────────
create table if not exists public.job_sync_logs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.job_sources (id) on delete cascade,
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
create index if not exists job_sync_logs_source_idx on public.job_sync_logs (source_id, started_at desc);

-- ── User features ───────────────────────────────────────────────────────────
create table if not exists public.saved_jobs (
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create table if not exists public.hidden_jobs (
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create table if not exists public.job_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  reason text not null check (reason in ('suspicious','expired','wrong_info','duplicate','offensive','other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists job_reports_job_idx on public.job_reports (job_id);
create index if not exists job_reports_status_idx on public.job_reports (status, created_at desc);

create table if not exists public.job_alerts (
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
create index if not exists job_alerts_user_idx on public.job_alerts (user_id);

create table if not exists public.job_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  alert_id uuid references public.job_alerts (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete cascade,
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (alert_id, job_id)
);
create index if not exists job_notifications_user_idx on public.job_notifications (user_id, created_at desc);

-- Privacy-minimal analytics: no IP, no user agent; session_id is a random cookie.
create table if not exists public.job_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('job_view','apply_click','save_job','share_job','report_job','search','filter_used','hide_job')),
  job_id uuid references public.jobs (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  session_id text,
  section text,
  query text check (char_length(query) <= 200),
  filters jsonb,
  created_at timestamptz not null default now()
);
create index if not exists job_events_type_time_idx on public.job_events (event_type, created_at desc);
create index if not exists job_events_job_idx on public.job_events (job_id) where job_id is not null;

-- Employer contact details are kept apart from the public job row.
create table if not exists public.job_submission_contacts (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  contact_name text not null,
  contact_phone text not null,
  terms_accepted_at timestamptz not null,
  privacy_accepted_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.job_ai_summaries (
  job_id uuid not null references public.jobs (id) on delete cascade,
  language text not null default 'te',
  summary text not null,
  model text,
  created_at timestamptz not null default now(),
  primary key (job_id, language)
);
