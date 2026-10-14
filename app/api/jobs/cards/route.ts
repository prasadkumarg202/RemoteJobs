import { NextResponse } from "next/server";
import { getJobsByIds } from "@/lib/jobs/data";

// Cards for device-saved jobs (signed-out users). Public data only.
export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 100);
  const jobs = await getJobsByIds(ids);
  return NextResponse.json({ jobs: jobs.map((j) => ({ id: j.id, slug: j.slug, title: j.title, company_name: j.company_name, posted_at: j.posted_at, source_name: j.source_name, work_mode: j.work_mode, india_eligibility: j.india_eligibility })) });
}
