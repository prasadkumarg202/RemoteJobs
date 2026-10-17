// fetch wrapper for Supabase-compatible hosts that differ from PostgREST in small ways (found on AapStack /
// OwnDatabase). Both rewrites produce requests PostgREST accepts too, so the wrapper is used everywhere.
//
// 1. Bulk inserts: postgrest-js sends ?columns="slug","title"; AapStack takes the quotes literally.
// 2. RPC list arguments: AapStack binds every argument as `$n::text::<type>`, so a JSON array (["a","b"])
//    can't become text[] / uuid[]. Postgres array literals ({"a","b"}) work on both.

export function stripQuotedColumns(url: string): string {
  if (!url.includes("columns=")) return url;
  try {
    const u = new URL(url);
    const c = u.searchParams.get("columns");
    if (!c || !c.includes('"')) return url;
    u.searchParams.set("columns", c.split(",").map((s) => s.trim().replace(/^"(.*)"$/, "$1")).join(","));
    return u.toString();
  } catch {
    return url;
  }
}

/** ["a", "b\"c", null] → {"a","b\"c",NULL} */
export function pgArrayLiteral(values: unknown[]): string {
  return `{${values.map((v) => (v === null || v === undefined ? "NULL" : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",")}}`;
}

/** Top-level array arguments of an RPC body become Postgres array literals (only flat arrays of scalars). */
export function rpcArraysToLiterals(body: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return body; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return body;
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (Array.isArray(v) && v.every((x) => x === null || ["string", "number", "boolean"].includes(typeof x))) {
      out[k] = pgArrayLiteral(v);
      changed = true;
    } else out[k] = v;
  }
  return changed ? JSON.stringify(out) : body;
}

export const compatFetch: typeof fetch = (input, init) => {
  if (typeof input !== "string" && !(input instanceof URL)) return fetch(input, init);
  const url = stripQuotedColumns(String(input));
  if (init?.body && typeof init.body === "string" && /\/rpc\/[^/?]+(\?|$)/.test(url)) {
    return fetch(url, { ...init, body: rpcArraysToLiterals(init.body) });
  }
  return fetch(url, init);
};
