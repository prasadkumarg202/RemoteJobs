-- Converted for AapStack (schema project_remotejobs) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.
-- Greenhouse and Lever only fetch the company boards an admin lists. With no boards a run has nothing
-- to do, so keep them switched off until boards are saved (saving boards in /admin/jobs switches them on).
update job_sources set enabled = false
where slug in ('greenhouse', 'lever') and coalesce(jsonb_array_length(config -> 'boards'), 0) = 0;
