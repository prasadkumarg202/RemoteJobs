import { NextResponse } from "next/server";
import { DEMO_MODE } from "@/lib/env";
import { recordEvent } from "@/lib/jobs/events";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

const REASONS = ["suspicious", "expired", "wrong_info", "duplicate", "offensive", "other"];
const recent = new Map<string, number[]>(); // naive per-instance rate limit

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const jobId = String(body.job_id ?? "");
  const reason = String(body.reason ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(jobId) && !DEMO_MODE) return NextResponse.json({ error: "invalid job" }, { status: 400 });
  if (!REASONS.includes(reason)) return NextResponse.json({ error: "invalid reason" }, { status: 400 });
  if (DEMO_MODE) return NextResponse.json({ ok: true, demo: true });

  const sb = await supabaseServer();
  const user = (await sb!.auth.getUser()).data.user;
  const key = user?.id ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon";
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= 10) return NextResponse.json({ error: "too many reports" }, { status: 429 });
  recent.set(key, [...hits, now]);

  const admin = supabaseAdmin();
  const { error } = await admin!.from("job_reports").insert({ job_id: jobId, reason, details: typeof body.details === "string" ? body.details.slice(0, 1000) : null, user_id: user?.id ?? null });
  if (error) return NextResponse.json({ error: "could not save report" }, { status: 500 });
  // Several "suspicious" reports pull a job back into moderation automatically.
  if (reason === "suspicious") {
    const { count } = await admin!.from("job_reports").select("id", { count: "exact", head: true }).eq("job_id", jobId).eq("reason", "suspicious").eq("status", "open");
    if ((count ?? 0) >= 3) await admin!.from("jobs").update({ is_active: false, moderation_status: "pending", moderation_note: "Auto-held: 3+ suspicious reports" }).eq("id", jobId);
  }
  await recordEvent({ event: "report_job", job_id: jobId }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
