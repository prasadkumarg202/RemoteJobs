// AapStack (OwnDatabase) function: one job-source sync. Bundled per source by build-functions.ts.
// Runs on Node in AapStack's functions runtime: `export default async function (req)`.
// Called by AapStack cron (job type function.invoke → role service_role) or by the admin "Run sync" button
// with the service-role key. Anyone else gets 401.
import { PostgrestClient } from "@supabase/postgrest-js";
import { compatFetch, getAdapter, runSync, SupabaseJobRepository } from "../../supabase/functions/_shared/engine/index.ts";

declare const __SOURCE_SLUG__: string;

type Req = { method: string; headers: Record<string, string>; query?: Record<string, string>; body?: unknown; json?: () => Promise<unknown>; env: Record<string, string> };
const json = (status: number, body: unknown) => ({ status, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function bodyOf(req: Req): Promise<Record<string, unknown>> {
  try {
    const b = req.json ? await req.json() : typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export default async function handler(req: Req) {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  if (req.headers["x-odb-role"] !== "service_role") return json(401, { error: "unauthorized" });
  const env = req.env ?? {};
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return json(500, { error: "Set the function secret SUPABASE_SERVICE_ROLE_KEY (the project's service_role key)" });
  // The project's REST API through AapStack's internal gateway (the only address a function may call).
  const db = new PostgrestClient(env.ODB_REST_URL, { headers: { apikey: key, Authorization: `Bearer ${key}` }, fetch: compatFetch });
  try {
    const result = await runSync(getAdapter(__SOURCE_SLUG__), new SupabaseJobRepository(db as never), {
      force: req.query?.force === "1" || (await bodyOf(req)).force === true,
      secrets: {
        STARTUP_JOBS_API_KEY: env.STARTUP_JOBS_API_KEY,
        ADZUNA_APP_ID: env.ADZUNA_APP_ID,
        ADZUNA_APP_KEY: env.ADZUNA_APP_KEY,
        FREELANCER_OAUTH_TOKEN: env.FREELANCER_OAUTH_TOKEN,
        JOOBLE_API_KEY: env.JOOBLE_API_KEY,
      },
    });
    console.log(JSON.stringify({ fn: `sync-${__SOURCE_SLUG__}`, ...result, errors: result.errors.slice(0, 5) }));
    const failed = result.errors.length > 0 && result.jobs_found === 0 && !result.skipped_reason;
    return json(failed ? 502 : 200, result);
  } catch (e) {
    console.error(`sync-${__SOURCE_SLUG__} crashed`, (e as Error).message);
    return json(500, { error: (e as Error).message });
  }
}
