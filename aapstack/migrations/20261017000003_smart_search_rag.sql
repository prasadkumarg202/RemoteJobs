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

