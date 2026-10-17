// Embeddings for smart search and the jobs assistant (RAG).
// One 1024-number vector per job, stored in jobs.embedding by the embed-jobs function (cron, every 30 min).
// Providers (choose with EMBEDDINGS_PROVIDER; the key decides when it is unset):
//   voyage  POST https://api.voyageai.com/v1/embeddings  {input, model, input_type, output_dimension: 1024}   VOYAGE_API_KEY
//   openai  POST https://api.openai.com/v1/embeddings    {input, model, dimensions: 1024}                    OPENAI_API_KEY
// Documents and queries must use the same provider + model; switching means re-embedding (clear jobs.embedding).

export const EMBEDDING_DIMS = 1024;

export type EmbeddingsProvider = "voyage" | "openai";
export interface EmbeddingsConfig { provider: EmbeddingsProvider; apiKey: string; model: string }

const DEFAULT_MODEL: Record<EmbeddingsProvider, string> = { voyage: "voyage-4-lite", openai: "text-embedding-3-small" };

/** Reads provider/key/model from env-like secrets; null when no key is set (smart search stays off). */
export function embeddingsConfig(env: Record<string, string | undefined>): EmbeddingsConfig | null {
  const wanted = (env.EMBEDDINGS_PROVIDER ?? "").toLowerCase();
  const provider: EmbeddingsProvider | null =
    wanted === "openai" ? "openai" : wanted === "voyage" ? "voyage" : env.VOYAGE_API_KEY ? "voyage" : env.OPENAI_API_KEY ? "openai" : null;
  if (!provider) return null;
  const apiKey = provider === "voyage" ? env.VOYAGE_API_KEY : env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return { provider, apiKey, model: env.EMBEDDINGS_MODEL || DEFAULT_MODEL[provider] };
}

/** Postgres/pgvector text form: "[0.1,0.2,…]". */
export function toVectorLiteral(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? Number(x.toFixed(7)) : 0)).join(",")}]`;
}

export class EmbeddingsError extends Error {}

export async function embedTexts(
  texts: string[],
  kind: "document" | "query",
  cfg: EmbeddingsConfig,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 20000,
): Promise<number[][]> {
  if (!texts.length) return [];
  const body = cfg.provider === "voyage"
    ? { input: texts, model: cfg.model, input_type: kind, output_dimension: EMBEDDING_DIMS, truncation: true }
    : { input: texts, model: cfg.model, dimensions: EMBEDDING_DIMS };
  const url = cfg.provider === "voyage" ? "https://api.voyageai.com/v1/embeddings" : "https://api.openai.com/v1/embeddings";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 200);
      try { const j = JSON.parse(text); msg = j.detail ?? j.error?.message ?? j.message ?? msg; } catch { /* keep text */ }
      throw new EmbeddingsError(`${cfg.provider} embeddings HTTP ${res.status}: ${String(msg).replace(cfg.apiKey, "***")}`);
    }
    const data = (JSON.parse(text) as { data?: Array<{ embedding?: number[]; index?: number }> }).data;
    if (!Array.isArray(data) || data.length !== texts.length) throw new EmbeddingsError(`${cfg.provider} returned ${data?.length ?? 0} embeddings for ${texts.length} texts`);
    const out = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => d.embedding ?? []);
    if (out.some((v) => v.length !== EMBEDDING_DIMS)) throw new EmbeddingsError(`${cfg.provider} returned vectors that are not ${EMBEDDING_DIMS} long — check EMBEDDINGS_MODEL`);
    return out;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new EmbeddingsError(`${cfg.provider} embeddings timed out`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface EmbedRunResult { embedded: number; batches: number; remaining: boolean; error?: string; skipped_reason?: string }

/**
 * Embeds active jobs that have no vector yet (or whose text changed), in batches, within a time budget.
 * Uses the SQL helpers jobs_needing_embedding() and set_job_embeddings() (service role only).
 */
export async function runEmbeddings(
  db: RpcClient,
  cfg: EmbeddingsConfig | null,
  opts: { batchSize?: number; maxBatches?: number; budgetMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<EmbedRunResult> {
  if (!cfg) return { embedded: 0, batches: 0, remaining: false, skipped_reason: "No embeddings key (VOYAGE_API_KEY or OPENAI_API_KEY) — smart search is off" };
  const batchSize = opts.batchSize ?? 64, maxBatches = opts.maxBatches ?? 20, budget = opts.budgetMs ?? 45000;
  const started = Date.now();
  let embedded = 0, batches = 0;
  while (batches < maxBatches && Date.now() - started < budget) {
    const { data, error } = await db.rpc("jobs_needing_embedding", { p_limit: batchSize });
    if (error) return { embedded, batches, remaining: true, error: `jobs_needing_embedding: ${error.message}` };
    const rows = (data ?? []) as Array<{ id: string; content: string; content_hash: string }>;
    if (!rows.length) return { embedded, batches, remaining: false };
    let vectors: number[][];
    try {
      vectors = await embedTexts(rows.map((r) => r.content || " "), "document", cfg, opts.fetchImpl);
    } catch (e) {
      return { embedded, batches, remaining: true, error: (e as Error).message };
    }
    const payload = JSON.stringify(rows.map((r, i) => ({ id: r.id, hash: r.content_hash, embedding: toVectorLiteral(vectors[i]) })));
    const set = await db.rpc("set_job_embeddings", { p_rows: payload });
    if (set.error) return { embedded, batches, remaining: true, error: `set_job_embeddings: ${set.error.message}` };
    embedded += Number(set.data ?? 0);
    batches++;
    if (rows.length < batchSize) return { embedded, batches, remaining: false };
  }
  return { embedded, batches, remaining: true };
}
