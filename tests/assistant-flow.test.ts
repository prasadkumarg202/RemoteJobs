// End-to-end jobs assistant (RAG) against the local database: real search_jobs + embeddings in Postgres,
// fake Voyage and Anthropic APIs. Runs with INTEGRATION_PGRST (Supabase mode) like integration.test.ts.
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PostgrestClient } from "@supabase/postgrest-js";
import { compatFetch, EMBEDDING_DIMS, RemoteOkAdapter, runEmbeddings, runSync, SupabaseJobRepository } from "@engine";
import { FIXTURE_NOW, sourceFetch } from "./helpers.ts";

const PGRST = process.env.INTEGRATION_PGRST;
const SECRET = process.env.INTEGRATION_JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (p: Record<string, unknown>) => {
  const h = b64({ alg: "HS256", typ: "JWT" }), b = b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...p });
  return `${h}.${b}.${createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url")}`;
};

const holder: { sb: unknown } = { sb: null };
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => holder.sb }));
vi.mock("@/lib/i18n-server", () => ({ getLang: async () => "en" }));
vi.mock("@/lib/env", () => ({ DEMO_MODE: false, SITE_URL: "http://localhost:3000", SUPABASE_URL: "x", SUPABASE_ANON_KEY: "x" }));

// Bag-of-words "embeddings": similar words → similar vectors.
const vec = (s: string) => {
  const v = new Array(EMBEDDING_DIMS).fill(0);
  for (const w of s.toLowerCase().match(/[a-z]{3,}/g) ?? []) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % EMBEDDING_DIMS] += 1; }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};

describe.skipIf(!PGRST)("jobs assistant (RAG) end to end", () => {
  const uid = "66666666-6666-4666-8666-666666666666";
  const realFetch = globalThis.fetch;
  let claudeCalls: Array<{ system: string; user: string }> = [];
  let claudeReply = "- Senior Backend Engineer [1] is open worldwide.\n- Also see [2].";
  const service = () => new PostgrestClient(PGRST!, { headers: { Authorization: `Bearer ${jwt({ role: "service_role" })}` }, fetch: compatFetch });

  beforeAll(async () => {
    process.env.VOYAGE_API_KEY = "test-voyage";
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://api.voyageai.com/")) {
        const body = JSON.parse(String(init?.body)) as { input: string[] };
        return new Response(JSON.stringify({ data: body.input.map((s, index) => ({ embedding: vec(s), index })) }), { status: 200 });
      }
      if (url.startsWith("https://api.anthropic.com/")) {
        const body = JSON.parse(String(init?.body));
        claudeCalls.push({ system: body.system, user: body.messages[0].content });
        return new Response(JSON.stringify({ model: body.model, content: [{ type: "text", text: claudeReply }] }), { status: 200 });
      }
      return realFetch(input, init);
    }) as typeof fetch);

    const db = service();
    await db.from("app_settings").update({ value: { mode: "open", trial_days: 3, device_change_cooldown_days: 30 } }).eq("key", "access");
    await db.from("app_settings").upsert({ key: "ai", value: { assistant: true, daily_questions: 2, min_similarity: 0.4 } });
    const { execSync } = await import("node:child_process");
    execSync(`psql -h /tmp -p 54329 -U postgres -d ${process.env.INTEGRATION_DB ?? "mk"} -q -c "insert into auth.users (id, email) values ('${uid}','ask@example.com') on conflict do nothing; delete from ai_usage where user_id = '${uid}'"`);
    await runSync(new RemoteOkAdapter(), new SupabaseJobRepository(db as never), { fetchImpl: sourceFetch(), now: FIXTURE_NOW, pageDelayMs: 0, force: true });
    const r = await runEmbeddings(db as never, { provider: "voyage", apiKey: "t", model: "m" }, { fetchImpl: globalThis.fetch });
    expect(r.error).toBeUndefined();

    const user = new PostgrestClient(PGRST!, { headers: { Authorization: `Bearer ${jwt({ role: "authenticated", sub: uid })}` }, fetch: compatFetch });
    holder.sb = { auth: { getUser: async () => ({ data: { user: { id: uid } } }) }, from: user.from.bind(user), rpc: user.rpc.bind(user) };
  }, 60000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    await service().from("app_settings").upsert({ key: "ai", value: { assistant: true, daily_questions: 20, min_similarity: 0.4 } });
  });

  const ask = async (q: string) => {
    const { askJobs } = await import("@/app/jobs/ask/actions");
    const fd = new FormData();
    fd.set("q", q);
    return askJobs(null, fd);
  };

  it("retrieves live jobs by meaning, sends them to Claude as numbered data, returns the answer", async () => {
    claudeCalls = [];
    const r = await ask("Which backend engineering jobs can I do from anywhere?");
    expect(r.note).toBeUndefined();
    expect(r.smart).toBe(true);
    expect(r.answer).toBe(claudeReply);
    expect(r.jobs.length).toBeGreaterThan(0);
    expect(r.jobs.length).toBeLessThanOrEqual(8);
    expect(claudeCalls).toHaveLength(1);
    expect(claudeCalls[0].system).toMatch(/ONLY the numbered job listings/);
    expect(claudeCalls[0].user).toMatch(/<listings>\n\[1\] /);
    expect(claudeCalls[0].user).toContain(r.jobs[0].title.slice(0, 20));
    expect(claudeCalls[0].user).toMatch(/<question>\nWhich backend engineering jobs/);
    expect(r.used).toBe(1);
  });

  it("enforces the daily limit (2 in this test) before calling Claude", async () => {
    claudeCalls = [];
    expect((await ask("python remote jobs")).note).toBeUndefined();
    const third = await ask("react remote jobs");
    expect(third.note).toBe("quota");
    expect(claudeCalls).toHaveLength(1);
  });

  it("with the assistant switched off it still returns matching jobs", async () => {
    await service().from("app_settings").upsert({ key: "ai", value: { assistant: false, daily_questions: 20, min_similarity: 0.4 } });
    const r = await ask("frontend developer jobs");
    expect(r.note).toBe("off");
    expect(r.answer).toBeNull();
    expect(r.jobs.length).toBeGreaterThan(0);
  });

  it("too-short questions are refused without any API call", async () => {
    claudeCalls = [];
    expect((await ask(" a ")).note).toBe("short");
    expect(claudeCalls).toHaveLength(0);
  });
});
