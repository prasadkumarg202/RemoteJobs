import { NextResponse } from "next/server";
import { DEMO_MODE } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

// "తెలుగులో అర్థం చేసుకోండి": a concise Telugu explanation, generated once per job and cached.
// The original description is never modified. Disabled unless ANTHROPIC_API_KEY is set.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (DEMO_MODE || !apiKey) return NextResponse.json({ error: "Telugu summaries are not enabled" }, { status: 501 });

  const sb = await supabaseServer();
  const { data: cached } = await sb!.from("job_ai_summaries").select("summary").eq("job_id", id).eq("language", "te").maybeSingle();
  if (cached) return NextResponse.json({ summary: cached.summary, cached: true });

  const { data: job } = await sb!.from("jobs").select("id,title,company_name,description,work_mode,eligible_countries,india_eligibility,salary_min,salary_max,salary_currency,salary_period").eq("id", id).maybeSingle();
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  const prompt = `Explain this job posting in simple Telugu for a job seeker in Andhra Pradesh/Telangana, in 5–7 short bullet points: what the work is, key skills, experience, pay (as stated, do not convert), job type, and who can apply (location). Keep technical terms (e.g. Python, React, n8n) in English. Do not add facts that are not in the posting. If something is not stated, say it is not mentioned.

Title: ${job.title}
Company: ${job.company_name}
Work mode: ${job.work_mode}; eligible countries: ${(job.eligible_countries ?? []).join(", ") || "not stated"}
Salary: ${job.salary_min ?? ""}-${job.salary_max ?? ""} ${job.salary_currency ?? ""} ${job.salary_period ?? ""}

Description:
${String(job.description).slice(0, 8000)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.AI_SUMMARY_MODEL ?? "claude-haiku-5-5", max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) return NextResponse.json({ error: "summary failed" }, { status: 502 });
  const out = await res.json();
  const summary = (out.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim();
  if (!summary) return NextResponse.json({ error: "empty summary" }, { status: 502 });
  await supabaseAdmin()?.from("job_ai_summaries").upsert({ job_id: id, language: "te", summary, model: out.model ?? null });
  return NextResponse.json({ summary });
}
