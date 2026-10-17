// Scheduled sync for the "lever" job source (company boards listed in job_sources.config.boards). See supabase/cron.sql.
import { serveSync } from "../_shared/serve-sync.ts";

Deno.serve(serveSync("lever"));
