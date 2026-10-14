-- Search, maintenance, alerts, admin RPCs and row-level security.

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function public.current_profile_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.india_mode_match(p_mode text, p_elig text)
returns boolean language sql immutable as $$
  select case coalesce(p_mode, 'any')
    when 'any' then true
    when 'india_only' then p_elig = 'explicit'
    when 'india_apac' then p_elig in ('explicit', 'region', 'timezone')
    when 'worldwide' then p_elig = 'worldwide'
    when 'eligible' then p_elig in ('explicit', 'worldwide', 'region', 'timezone')
    else true end;
$$;

create or replace function public.job_card_json(j public.jobs)
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
create or replace function public.search_jobs(
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
language plpgsql stable security invoker set search_path = public, extensions as $$
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
    from public.jobs j
    where j.is_active and j.moderation_status = 'approved'
      and (j.expires_at is null or j.expires_at > now())
      and (v_q is null or (v_tsq is not null and j.search_vector @@ v_tsq) or j.title ilike '%' || v_q || '%' or j.company_name ilike '%' || v_q || '%')
      and (p_sections is null or j.sections @> p_sections)
      and public.india_mode_match(p_india_mode, j.india_eligibility)
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
      and (p_sources is null or exists (select 1 from public.job_sources s where s.id = j.source_id and s.slug = any (p_sources)))
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
    'items', coalesce((select jsonb_agg(public.job_card_json(p.j) order by
        case when p_sort = 'salary' then (p.j).salary_inr_annual_max end desc nulls last,
        case when p_sort = 'relevance' and v_tsq is not null then p.rank end desc nulls last,
        (p.j).is_featured desc, (p.j).posted_at desc) from page p), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.job_section_counts()
returns jsonb language sql stable security invoker set search_path = public as $$
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
  from public.jobs
  where is_active and moderation_status = 'approved' and (expires_at is null or expires_at > now());
$$;

-- ── Maintenance (service role only) ─────────────────────────────────────────
create or replace function public.deactivate_missing_jobs(p_source_id uuid, p_seen text[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.jobs set is_active = false, moderation_status = 'expired'
  where source_id = p_source_id and is_active and not (source_job_id = any (p_seen));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.expire_jobs()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_expired integer := 0; v_removed integer := 0; v_retention integer := 0; v_employer integer := 0;
  v_started timestamptz := now();
begin
  -- 1. Past their expiry date
  update public.jobs set is_active = false, moderation_status = 'expired'
  where is_active and expires_at is not null and expires_at < now();
  get diagnostics v_expired = row_count;

  -- 2. No longer seen in any source feed within that source's retention window (removed upstream)
  update public.jobs j set is_active = false, moderation_status = 'expired'
  where j.is_active and j.source_id in (select id from public.job_sources where source_type in ('api','rss','mcp'))
    and not exists (
      select 1 from public.job_sources_mapping m join public.job_sources s on s.id = m.source_id
      where m.job_id = j.id and m.last_seen_at > now() - make_interval(days => s.retention_days));
  get diagnostics v_removed = row_count;

  -- 3. Older than the source retention period
  update public.jobs j set is_active = false, moderation_status = 'expired'
  from public.job_sources s
  where j.source_id = s.id and j.is_active and s.source_type in ('api','rss','mcp')
    and j.posted_at < now() - make_interval(days => s.retention_days);
  get diagnostics v_retention = row_count;

  -- 4. Employer jobs without an expiry date: 60 days after publishing
  update public.jobs j set is_active = false, moderation_status = 'expired'
  where j.is_active and j.expires_at is null and coalesce(j.published_at, j.created_at) < now() - interval '60 days'
    and j.source_id in (select id from public.job_sources where source_type in ('employer','manual'));
  get diagnostics v_employer = row_count;

  insert into public.job_sync_logs (kind, status, started_at, completed_at, jobs_expired)
  values ('expiry', 'success', v_started, now(), v_expired + v_removed + v_retention + v_employer);

  return jsonb_build_object('expired', v_expired, 'removed_upstream', v_removed, 'beyond_retention', v_retention, 'employer_stale', v_employer);
end $$;

create or replace function public.process_job_alerts()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare a record; v_total integer := 0; v_n integer; v_started timestamptz := now();
begin
  for a in select * from public.job_alerts where is_active loop
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

revoke execute on function public.deactivate_missing_jobs(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.expire_jobs() from public, anon, authenticated;
revoke execute on function public.process_job_alerts() from public, anon, authenticated;

-- ── Admin RPCs ──────────────────────────────────────────────────────────────
create or replace function public.admin_job_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_jobs_admin() and coalesce(auth.role(), '') <> 'service_role' then
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
    'open_reports', (select count(*) from public.job_reports where status = 'open')
  ) into v from public.jobs;

  return v || jsonb_build_object('sources', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name, 'enabled', s.enabled, 'source_type', s.source_type,
      'last_run_at', s.last_run_at, 'last_success_at', s.last_success_at, 'last_error_at', s.last_error_at, 'last_error', s.last_error,
      'last_jobs_fetched', s.last_jobs_fetched, 'last_jobs_inserted', s.last_jobs_inserted, 'terms_url', s.terms_url,
      'terms_verified_at', s.terms_verified_at, 'min_interval_minutes', s.min_interval_minutes, 'rate_limit', s.rate_limit,
      'active_jobs', (select count(*) from public.jobs j where j.source_id = s.id and j.is_active),
      'recent_logs', (select coalesce(jsonb_agg(l order by l.started_at desc), '[]'::jsonb) from (
          select started_at, completed_at, status, jobs_found, jobs_added, jobs_updated, jobs_skipped, jobs_duplicates, jobs_expired, used_fallback, errors
          from public.job_sync_logs where source_id = s.id order by started_at desc limit 5) l)
    ) order by s.name) from public.job_sources s), '[]'::jsonb));
end $$;

create or replace function public.admin_job_analytics(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_since timestamptz := now() - make_interval(days => p_days);
begin
  if not public.is_jobs_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'events', (select coalesce(jsonb_object_agg(event_type, n), '{}'::jsonb) from (
        select event_type, count(*) n from public.job_events where created_at >= v_since group by 1) t),
    'top_searches', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select lower(query) as query, count(*) as n from public.job_events
        where event_type = 'search' and created_at >= v_since and query is not null group by 1 order by 2 desc limit 15) t),
    'most_viewed', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select j.slug, j.title, j.company_name, count(*) as n from public.job_events e join public.jobs j on j.id = e.job_id
        where e.event_type = 'job_view' and e.created_at >= v_since group by 1, 2, 3 order by 4 desc limit 10) t),
    'most_applied_category', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select coalesce(j.subcategory, j.category, 'other') as category, count(*) as n from public.job_events e join public.jobs j on j.id = e.job_id
        where e.event_type = 'apply_click' and e.created_at >= v_since group by 1 order by 2 desc limit 10) t),
    'popular_ai_skills', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select k as skill, count(*) as n from public.job_events e join public.jobs j on j.id = e.job_id, unnest(j.keywords) k
        join public.job_categories c on c.slug = k and c.is_ai
        where e.event_type in ('job_view','apply_click') and e.created_at >= v_since group by 1 order by 2 desc limit 10) t),
    'searches_by_section', (select coalesce(jsonb_object_agg(coalesce(section, 'all'), n), '{}'::jsonb) from (
        select section, count(*) n from public.job_events where event_type = 'search' and created_at >= v_since group by 1) t)
  );
end $$;

-- ── Row-level security ─────────────────────────────────────────────────────
alter table public.jobs enable row level security;
alter table public.job_sources enable row level security;
alter table public.job_sources_mapping enable row level security;
alter table public.job_categories enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.job_sync_logs enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.hidden_jobs enable row level security;
alter table public.job_reports enable row level security;
alter table public.job_alerts enable row level security;
alter table public.job_notifications enable row level security;
alter table public.job_events enable row level security;
alter table public.job_submission_contacts enable row level security;
alter table public.job_ai_summaries enable row level security;
alter table public.profiles enable row level security;

do $$
declare p record;
begin
  for p in select * from (values
    -- jobs
    ('jobs', 'jobs_public_read', 'select', 'is_active and moderation_status = ''approved''', null),
    ('jobs', 'jobs_owner_read', 'select', 'submitted_by = auth.uid()', null),
    ('jobs', 'jobs_admin_all', 'all', 'public.is_jobs_admin()', 'public.is_jobs_admin()'),
    -- reference data
    ('job_sources', 'job_sources_public_read', 'select', 'true', null),
    ('job_sources', 'job_sources_admin_write', 'all', 'public.is_jobs_admin()', 'public.is_jobs_admin()'),
    ('job_sources_mapping', 'job_sources_mapping_public_read', 'select', 'true', null),
    ('job_categories', 'job_categories_public_read', 'select', 'true', null),
    ('job_categories', 'job_categories_admin_write', 'all', 'public.is_jobs_admin()', 'public.is_jobs_admin()'),
    ('exchange_rates', 'exchange_rates_public_read', 'select', 'true', null),
    ('exchange_rates', 'exchange_rates_admin_write', 'all', 'public.is_jobs_admin()', 'public.is_jobs_admin()'),
    ('job_sync_logs', 'job_sync_logs_admin_read', 'select', 'public.is_jobs_admin()', null),
    ('job_ai_summaries', 'job_ai_summaries_public_read', 'select', 'true', null),
    -- user-owned
    ('saved_jobs', 'saved_jobs_owner', 'all', 'user_id = auth.uid()', 'user_id = auth.uid()'),
    ('hidden_jobs', 'hidden_jobs_owner', 'all', 'user_id = auth.uid()', 'user_id = auth.uid()'),
    ('job_alerts', 'job_alerts_owner', 'all', 'user_id = auth.uid()', 'user_id = auth.uid()'),
    ('job_notifications', 'job_notifications_owner_read', 'select', 'user_id = auth.uid()', null),
    ('job_notifications', 'job_notifications_owner_update', 'update', 'user_id = auth.uid()', 'user_id = auth.uid()'),
    ('job_notifications', 'job_notifications_owner_delete', 'delete', 'user_id = auth.uid()', null),
    ('job_reports', 'job_reports_insert_own', 'insert', null, 'user_id is null or user_id = auth.uid()'),
    ('job_reports', 'job_reports_admin', 'all', 'public.is_jobs_admin()', 'public.is_jobs_admin()'),
    ('job_submission_contacts', 'job_submission_contacts_owner_read', 'select', 'user_id = auth.uid()', null),
    ('job_submission_contacts', 'job_submission_contacts_admin_read', 'select', 'public.is_jobs_admin()', null),
    ('job_events', 'job_events_admin_read', 'select', 'public.is_jobs_admin()', null),
    ('profiles', 'profiles_self_read', 'select', 'id = auth.uid() or public.is_jobs_admin()', null),
    ('profiles', 'profiles_self_update', 'update', 'id = auth.uid()', 'id = auth.uid() and role = public.current_profile_role()')
  ) as t(tbl, name, cmd, using_expr, check_expr) loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.name) then
      execute format('create policy %I on public.%I for %s %s %s', p.name, p.tbl, p.cmd,
        case when p.using_expr is not null then 'using (' || p.using_expr || ')' else '' end,
        case when p.check_expr is not null then 'with check (' || p.check_expr || ')' else '' end);
    end if;
  end loop;
end $$;
