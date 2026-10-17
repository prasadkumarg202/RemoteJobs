// Shared HTTP handler for the sync-* Edge Functions (Deno runtime).
// Auth: called by pg_cron with `x-cron-secret`, or by an admin action with the service-role key.
import { createClient } from "npm:@supabase/supabase-js@2";
import { compatFetch, getAdapter, runSync, SupabaseJobRepository } from "./engine/index.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });

export function isAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const given = req.headers.get("x-cron-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return (!!cronSecret && given === cronSecret) || (!!serviceKey && bearer === serviceKey);
}

export function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: compatFetch },
  });
}

export function serveSync(slug: string) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    const force = new URL(req.url).searchParams.get("force") === "1";
    try {
      const result = await runSync(getAdapter(slug), new SupabaseJobRepository(adminClient()), {
        force,
        secrets: {
          STARTUP_JOBS_API_KEY: Deno.env.get("STARTUP_JOBS_API_KEY"),
          ADZUNA_APP_ID: Deno.env.get("ADZUNA_APP_ID"),
          ADZUNA_APP_KEY: Deno.env.get("ADZUNA_APP_KEY"),
          FREELANCER_OAUTH_TOKEN: Deno.env.get("FREELANCER_OAUTH_TOKEN"),
          JOOBLE_API_KEY: Deno.env.get("JOOBLE_API_KEY"),
        },
      });
      console.log(JSON.stringify({ fn: `sync-${slug}`, ...result, errors: result.errors.slice(0, 5) }));
      const failed = result.errors.length > 0 && result.jobs_found === 0 && !result.skipped_reason;
      return json(result, failed ? 502 : 200);
    } catch (e) {
      console.error(`sync-${slug} crashed`, e);
      return json({ error: (e as Error).message }, 500);
    }
  };
}
