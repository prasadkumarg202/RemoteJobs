import { notFound, redirect } from "next/navigation";
import { DEMO_MODE } from "@/lib/env";
import { DEMO_JOBS } from "@/lib/jobs/demo";
import { supabaseServer } from "@/lib/supabase/server";

// Stable listing URL for employer submissions (source_job_id) → canonical job page.
export default async function EmployerJobRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (DEMO_MODE) {
    const j = DEMO_JOBS.find((x) => x.id === id);
    if (j) redirect(`/jobs/${j.slug}`);
    notFound();
  }
  const sb = await supabaseServer();
  const { data } = await sb!.from("jobs").select("slug").eq("source_job_id", id).maybeSingle();
  if (!data) notFound();
  redirect(`/jobs/${data.slug}`);
}
