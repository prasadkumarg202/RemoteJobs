// Scheduled sync for the "adzuna" job source. See supabase/cron.sql for the schedule.
import { serveSync } from "../_shared/serve-sync.ts";

Deno.serve(serveSync("adzuna"));
