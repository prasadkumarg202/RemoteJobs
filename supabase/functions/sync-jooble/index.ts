// Scheduled sync for the "jooble" job source. See supabase/cron.sql.
import { serveSync } from "../_shared/serve-sync.ts";

Deno.serve(serveSync("jooble"));
