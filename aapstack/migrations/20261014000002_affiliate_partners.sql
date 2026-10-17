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
