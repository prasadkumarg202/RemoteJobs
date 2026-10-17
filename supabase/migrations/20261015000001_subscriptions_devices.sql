-- Subscription access + one device per account.
--   * app_settings.access: mode ('subscription' | 'open'), trial_days, device_change_cooldown_days
--   * subscription_plans: prices shown on /subscribe; each maps to a Razorpay plan id
--   * subscriptions: trial / razorpay / admin-granted access periods (access while current_end > now())
--   * user_devices: the single device bound to each account (only a hash of the device id is stored)
-- Job data (jobs, source links, AI summaries) is readable only with access: public.has_job_access().
-- Set mode to 'open' to return to a free, public site (also set ACCESS_MODE=open for the Next.js app).

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.app_settings (key, value) values
  ('access', '{"mode": "subscription", "trial_days": 3, "device_change_cooldown_days": 30}')
on conflict (key) do nothing;

create table if not exists public.subscription_plans (
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
insert into public.subscription_plans (id, name, name_te, price_inr, interval_months, sort_order) values
  ('monthly', 'Monthly', 'నెలవారీ', 49, 1, 1),
  ('quarterly', '3 months', '3 నెలలు', 129, 3, 2),
  ('yearly', '12 months', '12 నెలలు', 399, 12, 3)
on conflict (id) do nothing;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text references public.subscription_plans (id) on delete set null,
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
create index if not exists subscriptions_user_idx on public.subscriptions (user_id, current_end desc);
-- One trial per account, ever.
create unique index if not exists subscriptions_one_trial on public.subscriptions (user_id) where provider = 'trial';

create table if not exists public.subscription_events (
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

create table if not exists public.user_devices (
  user_id uuid primary key references auth.users (id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  device_label text check (char_length(device_label) <= 120),
  bound_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  changed_count integer not null default 0,
  last_changed_at timestamptz
);

-- ---------------------------------------------------------------- access helpers

create or replace function public.access_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.app_settings where key = 'access'),
                  '{"mode": "subscription", "trial_days": 0, "device_change_cooldown_days": 30}'::jsonb)
$$;

create or replace function public.access_until(p_user uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select max(current_end) from public.subscriptions
  where user_id = p_user and status not in ('created') and current_end is not null
$$;

/** True when the caller may read job data. */
create or replace function public.has_job_access()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role'
      or public.access_settings() ->> 'mode' = 'open'
      or public.is_jobs_admin()
      or coalesce(public.access_until(auth.uid()) > now(), false)
$$;

/** What the app needs to decide where to send a signed-in user. */
create or replace function public.access_status(p_device_hash text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  d public.user_devices;
  s jsonb := public.access_settings();
begin
  if v_uid is null then return jsonb_build_object('signed_in', false, 'mode', s ->> 'mode'); end if;
  select * into d from public.user_devices where user_id = v_uid;
  return jsonb_build_object(
    'signed_in', true,
    'mode', s ->> 'mode',
    'admin', public.is_jobs_admin(),
    'device', case when d.user_id is null then 'none' when d.device_hash = p_device_hash then 'match' else 'other' end,
    'device_label', d.device_label,
    'bound_at', d.bound_at,
    'access_until', public.access_until(v_uid),
    'trial_used', exists (select 1 from public.subscriptions where user_id = v_uid and provider = 'trial'),
    'can_move_device_at', case when d.last_changed_at is null then d.bound_at
                               else d.last_changed_at + make_interval(days => coalesce((s ->> 'device_change_cooldown_days')::int, 30)) end
  );
end $$;

/** Binds this device on first sign-in (and starts the free trial once); never replaces another device. */
create or replace function public.bind_device(p_device_hash text, p_label text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s jsonb := public.access_settings();
  v_trial int := coalesce((s ->> 'trial_days')::int, 0);
  d public.user_devices;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_device_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad device id' using errcode = '22023'; end if;
  -- Hosts that can't run a trigger on auth.users (e.g. AapStack) get the profile row here, at first sign-in.
  insert into public.profiles (id, phone) select u.id, u.phone from auth.users u where u.id = v_uid on conflict (id) do nothing;
  select * into d from public.user_devices where user_id = v_uid for update;
  if d.user_id is null then
    insert into public.user_devices (user_id, device_hash, device_label) values (v_uid, p_device_hash, left(p_label, 120));
    if s ->> 'mode' = 'subscription' and v_trial > 0 then
      insert into public.subscriptions (user_id, provider, status, current_start, current_end, note)
      values (v_uid, 'trial', 'trial', now(), now() + make_interval(days => v_trial), 'Free trial')
      on conflict do nothing;
    end if;
  elsif d.device_hash = p_device_hash then
    update public.user_devices set last_seen_at = now(), device_label = coalesce(left(p_label, 120), device_label) where user_id = v_uid;
  end if;
  return public.access_status(p_device_hash);
end $$;

/** Moves the account to this device, at most once per cooldown period (the old device loses access). */
create or replace function public.move_device(p_device_hash text, p_label text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_next timestamptz;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_device_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad device id' using errcode = '22023'; end if;
  v_next := (public.access_status(p_device_hash) ->> 'can_move_device_at')::timestamptz;
  if v_next is not null and v_next > now() then
    raise exception 'device change allowed after %', to_char(v_next at time zone 'Asia/Kolkata', 'DD Mon YYYY') using errcode = 'P0001';
  end if;
  update public.user_devices
     set device_hash = p_device_hash, device_label = left(p_label, 120), bound_at = now(), last_seen_at = now(),
         changed_count = changed_count + 1, last_changed_at = now()
   where user_id = v_uid;
  return public.access_status(p_device_hash);
end $$;

revoke execute on function public.access_until(uuid) from public, anon, authenticated;
grant execute on function public.access_until(uuid) to service_role;
revoke execute on function public.bind_device(text, text) from anon;
revoke execute on function public.move_device(text, text) from anon;

-- ---------------------------------------------------------------- RLS

alter table public.app_settings enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.user_devices enable row level security;

do $$
declare p record;
begin
  for p in select * from (values
    ('app_settings', 'app_settings_public_read', 'select', 'true', null),
    ('app_settings', 'app_settings_admin_write', 'all', 'public.is_jobs_admin()', 'public.is_jobs_admin()'),
    ('subscription_plans', 'subscription_plans_public_read', 'select', 'active', null),
    ('subscription_plans', 'subscription_plans_admin_all', 'all', 'public.is_jobs_admin()', 'public.is_jobs_admin()'),
    ('subscriptions', 'subscriptions_owner_read', 'select', 'user_id = auth.uid()', null),
    ('subscriptions', 'subscriptions_admin_all', 'all', 'public.is_jobs_admin()', 'public.is_jobs_admin()'),
    ('subscription_events', 'subscription_events_admin_read', 'select', 'public.is_jobs_admin()', null),
    ('user_devices', 'user_devices_owner_read', 'select', 'user_id = auth.uid()', null),
    ('user_devices', 'user_devices_admin_all', 'all', 'public.is_jobs_admin()', 'public.is_jobs_admin()')
  ) as t(tbl, name, cmd, using_expr, check_expr) loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.name) then
      execute format('create policy %I on public.%I for %s %s %s', p.name, p.tbl, p.cmd,
        case when p.using_expr is not null then 'using (' || p.using_expr || ')' else '' end,
        case when p.check_expr is not null then 'with check (' || p.check_expr || ')' else '' end);
    end if;
  end loop;
end $$;

-- Job data now needs access. `(select …)` lets Postgres evaluate the check once per query.
drop policy if exists jobs_public_read on public.jobs;
create policy jobs_public_read on public.jobs for select
  using (is_active and moderation_status = 'approved' and (select public.has_job_access()));
drop policy if exists job_sources_mapping_public_read on public.job_sources_mapping;
create policy job_sources_mapping_public_read on public.job_sources_mapping for select using ((select public.has_job_access()));
drop policy if exists job_ai_summaries_public_read on public.job_ai_summaries;
create policy job_ai_summaries_public_read on public.job_ai_summaries for select using ((select public.has_job_access()));

-- Job alerts only notify people who currently have access.
create or replace function public.process_job_alerts()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare a record; v_total integer := 0; v_n integer; v_started timestamptz := now();
begin
  for a in select al.* from public.job_alerts al
           where al.is_active
             and (public.access_settings() ->> 'mode' = 'open'
                  or coalesce(public.access_until(al.user_id) > now(), false)
                  or exists (select 1 from public.profiles p where p.id = al.user_id and p.role in ('admin', 'moderator'))) loop
    insert into public.job_notifications (user_id, alert_id, job_id, title, body, url)
    select a.user_id, a.id, j.id, j.title,
           j.company_name || ' · ' || case when j.work_mode = 'remote' then 'Remote' else coalesce(j.city, '') end,
           '/jobs/' || j.slug
    from public.jobs j
    where j.is_active and j.moderation_status = 'approved'
      and coalesce(j.published_at, j.created_at) > a.last_checked_at
      and (a.keywords is null or btrim(a.keywords) = '' or j.search_vector @@ (websearch_to_tsquery('english', a.keywords) || websearch_to_tsquery('simple', a.keywords)))
      and (a.category is null or j.category = a.category or j.subcategory = a.category or a.category = any (j.keywords))
      and (a.country is null or a.country = any (j.eligible_countries) or j.country = a.country or j.remote_worldwide)
      and (not a.remote_only or j.work_mode = 'remote')
      and (not a.ai_only or j.ai_score >= 40)
      and (not a.freelance_only or 'freelance' = any (j.sections))
      and public.india_mode_match(a.india_mode, j.india_eligibility)
      and (a.salary_min_inr is null or j.salary_inr_annual_max >= a.salary_min_inr)
      and (cardinality(a.employment_types) = 0 or j.employment_type = any (a.employment_types))
      and not exists (select 1 from public.hidden_jobs h where h.user_id = a.user_id and h.job_id = j.id)
    order by j.posted_at desc
    limit 20
    on conflict (alert_id, job_id) do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    update public.job_alerts set last_checked_at = v_started where id = a.id;
  end loop;
  insert into public.job_sync_logs (kind, status, started_at, completed_at, jobs_added)
  values ('alerts', 'success', v_started, now(), v_total);
  return v_total;
end $$;
revoke execute on function public.process_job_alerts() from public, anon, authenticated;
