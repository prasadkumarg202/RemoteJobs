// Scheduled sync for the "arbeitnow" job source. See supabase/cron.sql for the schedule.
import { serveSync } from "../_shared/serve-sync.ts";

Deno.serve(serveSync("arbeitnow"));
