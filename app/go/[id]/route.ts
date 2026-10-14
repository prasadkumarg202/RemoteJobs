import { NextResponse } from "next/server";
import { DEMO_MODE } from "@/lib/env";
import { DEMO_JOBS } from "@/lib/jobs/demo";
import { recordEvent } from "@/lib/jobs/events";
import { supabaseServer } from "@/lib/supabase/server";

// Apply redirect: logs apply_click, then sends the user to the ORIGINAL application page.
// Only http(s)/mailto/wa.me targets that belong to the job are allowed (no open redirect).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  type Row = { id: string; title: string; apply_url: string; external_url: string; application_method: string; apply_email: string | null; apply_whatsapp: string | null };
  let job: Row | null = null;
  if (DEMO_MODE) job = (DEMO_JOBS.find((j) => j.id === id) as unknown as Row) ?? null;
  else {
    const sb = await supabaseServer();
    const { data } = await sb!.from("jobs").select("id,title,apply_url,external_url,application_method,apply_email,apply_whatsapp").eq("id", id).maybeSingle();
    job = data as Row | null;
  }
  if (!job) return NextResponse.redirect(new URL("/jobs", _req.url), 302);

  let target: string | null = null;
  if (job.application_method === "email" && job.apply_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.apply_email)) {
    target = `mailto:${job.apply_email}?subject=${encodeURIComponent(`Application: ${job.title} (via Mana Kosamu)`)}`;
  } else if (job.application_method === "whatsapp" && job.apply_whatsapp) {
    const digits = job.apply_whatsapp.replace(/\D/g, "");
    if (digits.length >= 10) target = `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}?text=${encodeURIComponent(`Hello, I saw your job “${job.title}” on Mana Kosamu.`)}`;
  } else {
    const candidate = job.apply_url || job.external_url;
    try {
      const u = new URL(candidate);
      if (u.protocol === "https:" || u.protocol === "http:") target = u.toString();
    } catch { /* invalid */ }
  }
  await recordEvent({ event: "apply_click", job_id: job.id }).catch(() => undefined);
  if (!target) return NextResponse.redirect(new URL(`/jobs`, _req.url), 302);
  const res = NextResponse.redirect(target, 302);
  res.headers.set("Referrer-Policy", "origin");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
