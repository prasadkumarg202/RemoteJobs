import "server-only";
import { embeddingsConfig, embedTexts, toVectorLiteral } from "@engine/embeddings.ts";

// The visitor's search words → a meaning vector for search_jobs(p_embedding). Cached in memory (same words,
// same vector), 3 s timeout, and any failure just means plain keyword search.
const cache = new Map<string, string>();
const MAX = 500;

export function smartSearchEnabled(): boolean {
  return process.env.SMART_SEARCH !== "off" && embeddingsConfig(process.env) !== null;
}

export async function queryEmbedding(q: string | null | undefined): Promise<string | null> {
  const text = (q ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
  if (text.length < 3 || !smartSearchEnabled()) return null;
  const key = text.toLowerCase();
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  try {
    const [v] = await embedTexts([text], "query", embeddingsConfig(process.env)!, fetch, 3000);
    const lit = toVectorLiteral(v);
    cache.set(key, lit);
    if (cache.size > MAX) cache.delete(cache.keys().next().value!);
    return lit;
  } catch (e) {
    console.warn(`smart search off for this query: ${(e as Error).message}`);
    return null;
  }
}
