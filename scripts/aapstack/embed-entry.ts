// AapStack function "embed-jobs": fills jobs.embedding (smart search + jobs assistant). Cron every 30 min.
// Only role service_role (cron / admin) may call it.
import { PostgrestClient } from "@supabase/postgrest-js";
import { compatFetch, embeddingsConfig, runEmbeddings } from "../../supabase/functions/_shared/engine/index.ts";

type Req = { method: string; headers: Record<string, string>; env: Record<string, string> };
const json = (status: number, body: unknown) => ({ status, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default async function handler(req: Req) {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  if (req.headers["x-odb-role"] !== "service_role") return json(401, { error: "unauthorized" });
  const env = req.env ?? {};
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return json(500, { error: "Set the function secret SUPABASE_SERVICE_ROLE_KEY" });
  const db = new PostgrestClient(env.ODB_REST_URL, { headers: { apikey: key, Authorization: `Bearer ${key}` }, fetch: compatFetch });
  const result = await runEmbeddings(db as never, embeddingsConfig(env), { budgetMs: 45000 });
  console.log(JSON.stringify({ fn: "embed-jobs", ...result }));
  return json(result.error ? 502 : 200, result);
}
