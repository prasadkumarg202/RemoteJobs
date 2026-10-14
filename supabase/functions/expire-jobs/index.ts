// Deactivates expired / removed / stale jobs (never deletes) and fans out job alerts.
import { adminClient, isAuthorized } from "../_shared/serve-sync.ts";

Deno.serve(async (req) => {
  if (!isAuthorized(req)) return new Response("unauthorized", { status: 401 });
  const db = adminClient();
  const expired = await db.rpc("expire_jobs");
  const alerts = await db.rpc("process_job_alerts");
  const body = { expired: expired.data, expire_error: expired.error?.message, alerts_created: alerts.data, alerts_error: alerts.error?.message };
  return new Response(JSON.stringify(body), { status: expired.error || alerts.error ? 500 : 200, headers: { "Content-Type": "application/json" } });
});
