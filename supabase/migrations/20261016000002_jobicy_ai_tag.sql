-- Jobicy rejects tags shorter than 3 characters ("ai" → HTTP 400), which pushed every Jobicy run to the RSS
-- fallback. Search AI jobs with a longer tag instead.
update public.job_sources
set config = jsonb_set(config, '{queries}', (
  select coalesce(jsonb_agg(case when q ->> 'tag' = 'ai' then q || '{"tag": "artificial intelligence"}' else q end), '[]'::jsonb)
  from jsonb_array_elements(config -> 'queries') q))
where slug = 'jobicy' and config ? 'queries';
