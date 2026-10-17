-- Supabase scheduled jobs for the Job Engine.
-- Run once in the Supabase SQL editor AFTER deploying the Edge Functions.
-- Replace the two placeholders first. Re-running is safe (jobs are re-created).
--
-- Polling policy (per each source's published guidance, verified 2026-10-10):
--   Himalayas  : data refreshes daily            → once a day
--   Jobicy     : "no more than once per hour"    → every 6 hours
--   Remote OK  : public feed, poll politely      → every 6 hours
--   Startup Jobs (MCP, disabled by default)      → every 12 hours (no-op while disabled)
--   Remotive   : "~4 requests per day max"      → every 6 hours (1 request per run)
--   Adzuna     : 250 requests/day default       → every 12 hours, ≤6 requests per run (disabled by default)
--   Freelancer.com (disabled by default)        → every 6 hours
--   Working Nomads / Arbeitnow (disabled)       → every 12 hours
-- The pipeline additionally enforces job_sources.min_interval_minutes, so an
-- accidental extra trigger never results in an extra request to the source.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Secrets (stored encrypted in Supabase Vault)
select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'jobs_project_url')
where not exists (select 1 from vault.secrets where name = 'jobs_project_url');
select vault.create_secret('REPLACE-WITH-THE-SAME-CRON_SECRET-YOU-SET-FOR-EDGE-FUNCTIONS', 'jobs_cron_secret')
where not exists (select 1 from vault.secrets where name = 'jobs_cron_secret');

-- 2. Helper that calls an Edge Function with the cron secret
create or replace function public.invoke_job_function(p_name text)
returns bigint language sql security definer set search_path = public as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'jobs_project_url') || '/functions/v1/' || p_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'jobs_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$$;
revoke execute on function public.invoke_job_function(text) from public, anon, authenticated;

-- 3. Schedules (UTC). Odd minutes spread load away from :00.
do $$
declare j text;
begin
  foreach j in array array['jobs-sync-himalayas','jobs-sync-jobicy','jobs-sync-remoteok','jobs-sync-startupjobs','jobs-sync-remotive','jobs-sync-adzuna','jobs-sync-freelancer','jobs-sync-workingnomads','jobs-sync-arbeitnow','jobs-sync-greenhouse','jobs-sync-lever','jobs-sync-ashby','jobs-sync-weworkremotely','jobs-sync-jooble','jobs-embed','jobs-expire','jobs-alerts','jobs-events-retention'] loop
    if exists (select 1 from cron.job where jobname = j) then perform cron.unschedule(j); end if;
  end loop;
end $$;

select cron.schedule('jobs-sync-himalayas',   '17 1 * * *',    $$select public.invoke_job_function('sync-himalayas')$$);   -- 06:47 IST daily
select cron.schedule('jobs-sync-jobicy',      '23 */6 * * *',  $$select public.invoke_job_function('sync-jobicy')$$);
select cron.schedule('jobs-sync-remoteok',    '41 */6 * * *',  $$select public.invoke_job_function('sync-remoteok')$$);
select cron.schedule('jobs-sync-startupjobs', '7 */12 * * *',  $$select public.invoke_job_function('sync-startupjobs')$$);
select cron.schedule('jobs-sync-remotive',      '53 */6 * * *',  $$select public.invoke_job_function('sync-remotive')$$);
select cron.schedule('jobs-sync-adzuna',        '11 2,14 * * *', $$select public.invoke_job_function('sync-adzuna')$$);
select cron.schedule('jobs-sync-freelancer',    '29 */6 * * *',  $$select public.invoke_job_function('sync-freelancer')$$);
select cron.schedule('jobs-sync-workingnomads', '47 3,15 * * *', $$select public.invoke_job_function('sync-workingnomads')$$);
select cron.schedule('jobs-sync-arbeitnow',     '59 4,16 * * *', $$select public.invoke_job_function('sync-arbeitnow')$$);
select cron.schedule('jobs-sync-greenhouse',    '13 5,17 * * *', $$select public.invoke_job_function('sync-greenhouse')$$);
select cron.schedule('jobs-sync-lever',         '37 5,17 * * *', $$select public.invoke_job_function('sync-lever')$$);
select cron.schedule('jobs-sync-ashby',         '49 5,17 * * *', $$select public.invoke_job_function('sync-ashby')$$);
select cron.schedule('jobs-sync-weworkremotely','5 */6 * * *',   $$select public.invoke_job_function('sync-weworkremotely')$$);
select cron.schedule('jobs-sync-jooble',        '19 1,13 * * *', $$select public.invoke_job_function('sync-jooble')$$);
select cron.schedule('jobs-embed',            '21,51 * * * *', $$select public.invoke_job_function('embed-jobs')$$);  -- smart search vectors
select cron.schedule('jobs-expire',           '35 */3 * * *',  $$select public.expire_jobs()$$);
select cron.schedule('jobs-alerts',           '52 * * * *',    $$select public.process_job_alerts()$$);
-- Analytics retention: keep raw events for 180 days.
select cron.schedule('jobs-events-retention', '15 3 * * 0',    $$delete from public.job_events where created_at < now() - interval '180 days'$$);

-- Inspect:  select * from cron.job;  select * from cron.job_run_details order by start_time desc limit 20;
