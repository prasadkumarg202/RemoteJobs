// Scheduled sync for the "greenhouse" job source (company boards listed in job_sources.config.boards). See supabase/cron.sql.
import { serveSync } from "../_shared/serve-sync.ts";

Deno.serve(serveSync("greenhouse"));
