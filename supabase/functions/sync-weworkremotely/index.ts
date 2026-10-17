// Scheduled sync for the "weworkremotely" job source. See supabase/cron.sql.
import { serveSync } from "../_shared/serve-sync.ts";

Deno.serve(serveSync("weworkremotely"));
