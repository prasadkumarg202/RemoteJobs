// Runs a bundled AapStack function (aapstack/functions/sync-*.mjs) the way AapStack's runner does:
// import the module and call its default export with { method, headers, query, env }.
// Needs the local AapStack imitation (tests/sql/setup-aapstack-db.sh) + PostgREST on it: INTEGRATION_AAP_PGRST.
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureJson } from "./helpers.ts";

const PGRST = process.env.INTEGRATION_AAP_PGRST;
const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (p: Record<string, unknown>) => { const h = b64({ alg: "HS256", typ: "JWT" }), b = b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...p }); return `${h}.${b}.${createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url")}`; };
const bundle = new URL("../aapstack/functions/sync-himalayas.mjs", import.meta.url);

describe.skipIf(!PGRST || !existsSync(bundle))("AapStack function bundle", () => {
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    // Source APIs aren't reachable from the test sandbox: serve the fixture for Himalayas, pass the rest through.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (u.hostname === "himalayas.app") return new Response(JSON.stringify(fixtureJson("himalayas.json")), { headers: { "content-type": "application/json" } });
      return realFetch(input, init);
    }) as typeof fetch;
  });
  afterAll(() => { globalThis.fetch = realFetch; });

  const env = { ODB_REST_URL: PGRST!, SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role" }), ODB_PROJECT_ID: "6f4625ed-0000-0000-0000-000000000000" };

  it("refuses callers that aren't service_role", async () => {
    const { default: handler } = await import(bundle.href);
    expect((await handler({ method: "POST", headers: { "x-odb-role": "anon" }, query: {}, env })).status).toBe(401);
    expect((await handler({ method: "GET", headers: { "x-odb-role": "service_role" }, query: {}, env })).status).toBe(405);
  });

  it("syncs into the project schema through the REST API", async () => {
    const { default: handler } = await import(bundle.href);
    const r = await handler({ method: "POST", headers: { "x-odb-role": "service_role" }, query: { force: "1" }, env });
    const body = JSON.parse(r.body);
    expect(r.status, r.body).toBe(200);
    expect(body.jobs_found).toBeGreaterThan(10);
    const res = await realFetch(`${PGRST}/job_sync_logs?select=status&kind=eq.sync&order=started_at.desc&limit=1`, { headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
    expect(await res.json()).toEqual([{ status: "success" }]);
  });

  it("explains a missing service key", async () => {
    const { default: handler } = await import(bundle.href);
    const r = await handler({ method: "POST", headers: { "x-odb-role": "service_role" }, query: {}, env: { ODB_REST_URL: PGRST! } });
    expect(r.status).toBe(500);
    expect(r.body).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
