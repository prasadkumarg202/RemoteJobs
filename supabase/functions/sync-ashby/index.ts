// Scheduled sync for the "ashby" job source. See supabase/cron.sql.
import { serveSync } from "../_shared/serve-sync.ts";

Deno.serve(serveSync("ashby"));
