// Fills jobs.embedding for smart search and the jobs assistant (every 30 min from supabase/cron.sql).
// Needs VOYAGE_API_KEY or OPENAI_API_KEY as a function secret; without one it does nothing.
import { adminClient, isAuthorized } from "../_shared/serve-sync.ts";
import { embeddingsConfig, runEmbeddings } from "../_shared/engine/index.ts";

Deno.serve(async (req) => {
  if (!isAuthorized(req)) return new Response("unauthorized", { status: 401 });
  const cfg = embeddingsConfig({
    EMBEDDINGS_PROVIDER: Deno.env.get("EMBEDDINGS_PROVIDER"), EMBEDDINGS_MODEL: Deno.env.get("EMBEDDINGS_MODEL"),
    VOYAGE_API_KEY: Deno.env.get("VOYAGE_API_KEY"), OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY"),
  });
  const result = await runEmbeddings(adminClient(), cfg);
  console.log(JSON.stringify({ fn: "embed-jobs", ...result }));
  return new Response(JSON.stringify(result), { status: result.error ? 502 : 200, headers: { "Content-Type": "application/json" } });
});
