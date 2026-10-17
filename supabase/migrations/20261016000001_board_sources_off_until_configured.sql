-- Greenhouse and Lever only fetch the company boards an admin lists. With no boards a run has nothing
-- to do, so keep them switched off until boards are saved (saving boards in /admin/jobs switches them on).
update public.job_sources set enabled = false
where slug in ('greenhouse', 'lever') and coalesce(jsonb_array_length(config -> 'boards'), 0) = 0;
