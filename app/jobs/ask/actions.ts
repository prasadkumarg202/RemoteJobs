"use server";
import { DEMO_MODE } from "@/lib/env";
import { getLang } from "@/lib/i18n-server";
import { answerLanguage, CONTEXT_JOBS, cleanQuestion, keywordQuery, systemPrompt, userPrompt } from "@/lib/ai/assistant-core";
import { queryEmbedding } from "@/lib/ai/query-embedding";
import { rpcArgs } from "@/lib/jobs/data";
import { demoSearch } from "@/lib/jobs/demo";
import { applyIntent, parseQueryIntent } from "@/lib/jobs/filters";
import type { JobCard, JobFilters, SearchResult } from "@/lib/jobs/types";
import { supabaseServer } from "@/lib/supabase/server";

export interface AskResult {
  question: string;
  answer: string | null;
  jobs: JobCard[];
  lang: "en" | "te";
  /** Why there is no answer: the assistant is off, the daily limit is reached, or Claude failed. */
  note?: "off" | "quota" | "failed" | "short" | "signin" | "demo";
  used?: number;
  limit?: number | null;
  smart?: boolean;
}

/**
 * Jobs assistant (RAG). Retrieval: filters understood from the question (remote, India, fresher, part-time,
 * district…) + meaning search over the live jobs (embeddings; keyword fallback). Generation: Claude answers
 * only from those jobs and cites them as [n]. Job text is passed as untrusted data.
 */
export async function askJobs(_prev: AskResult | null, fd: FormData): Promise<AskResult> {
  const question = cleanQuestion(fd.get("q"));
  const lang = answerLanguage(question, await getLang());
  const base: AskResult = { question, answer: null, jobs: [], lang };
  if (question.length < 3) return { ...base, note: "short" };

  const intent = parseQueryIntent(question);
  const filters: JobFilters = { ...applyIntent({}, intent), q: undefined, limit: CONTEXT_JOBS, sort: "relevance" };

  if (DEMO_MODE) {
    const r = demoSearch({ ...filters, q: intent.text || undefined });
    return { ...base, jobs: r.items.slice(0, CONTEXT_JOBS), note: "demo" };
  }

  const sb = await supabaseServer();
  const { data: auth } = await sb!.auth.getUser();
  if (!auth.user) return { ...base, note: "signin" };
  const { data: s } = await sb!.from("app_settings").select("value").eq("key", "ai").maybeSingle();
  const settings = (s?.value ?? {}) as { assistant?: boolean };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const assistantOn = settings.assistant !== false && !!apiKey && process.env.AI_ASSISTANT !== "off";

  // Count the question before spending on it.
  let used: number | undefined, limit: number | null | undefined;
  if (assistantOn) {
    const { data: q, error } = await sb!.rpc("take_ai_quota");
    if (error) return { ...base, note: "failed" };
    const quota = q as { allowed: boolean; used: number; limit: number | null };
    used = quota.used; limit = quota.limit;
    if (!quota.allowed) return { ...base, note: "quota", used, limit };
  }

  // Retrieve.
  const embedding = await queryEmbedding(question);
  const run = async (f: JobFilters) => {
    const args = { ...rpcArgs({ ...f, q: embedding ? undefined : keywordQuery(intent.text || question) ?? undefined }), p_sort: "relevance" };
    const { data, error } = await sb!.rpc("search_jobs", embedding ? { ...args, p_embedding: embedding } : args);
    if (error) console.error("assistant retrieval failed", error.message);
    return (data as SearchResult | null)?.items ?? [];
  };
  let jobs = await run(filters);
  if (!jobs.length && (filters.sections?.length || filters.types?.length || filters.seniority?.length || filters.district)) {
    jobs = await run({ india: filters.india, limit: CONTEXT_JOBS, sort: "relevance" }); // loosen: keep only India
  }
  if (!assistantOn) return { ...base, jobs, note: "off", smart: !!embedding };

  // Generate.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_ASSISTANT_MODEL ?? process.env.AI_SUMMARY_MODEL ?? "claude-haiku-5-5",
        max_tokens: 700,
        system: systemPrompt(lang),
        messages: [{ role: "user", content: userPrompt(question, jobs) }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`assistant: Anthropic HTTP ${res.status}`);
      return { ...base, jobs, note: "failed", used, limit, smart: !!embedding };
    }
    const out = await res.json();
    const answer = (out.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim().slice(0, 4000);
    if (!answer) return { ...base, jobs, note: "failed", used, limit, smart: !!embedding };
    return { ...base, answer, jobs, used, limit, smart: !!embedding };
  } catch (e) {
    console.error("assistant failed", (e as Error).name === "AbortError" ? "timeout" : (e as Error).message);
    return { ...base, jobs, note: "failed", used, limit, smart: !!embedding };
  } finally {
    clearTimeout(timer);
  }
}
