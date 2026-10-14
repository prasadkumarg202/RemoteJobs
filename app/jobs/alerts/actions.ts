"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

const MODES = ["india_only", "india_apac", "worldwide", "eligible"];
const TYPES = ["full_time", "part_time", "contract", "freelance", "gig", "internship", "temporary"];

export async function createAlert(_: unknown, fd: FormData): Promise<{ ok: boolean; message: string }> {
  const sb = await supabaseServer();
  const user = sb ? (await sb.auth.getUser()).data.user : null;
  if (!user) return { ok: false, message: "Sign in to create alerts." };
  const { count } = await sb!.from("job_alerts").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= 20) return { ok: false, message: "You can keep up to 20 alerts. Delete one to add another." };
  const str = (k: string, max = 80) => String(fd.get(k) ?? "").trim().slice(0, max) || null;
  const india = str("india_mode");
  const salaryLakh = Number(fd.get("salary_lakh") ?? 0);
  const alert = {
    user_id: user.id,
    name: str("name") ?? "My job alert",
    keywords: str("keywords", 120),
    category: str("category"),
    country: str("country")?.toUpperCase().slice(0, 2) ?? null,
    india_mode: india && MODES.includes(india) ? india : null,
    remote_only: fd.get("remote_only") === "on",
    ai_only: fd.get("ai_only") === "on",
    freelance_only: fd.get("freelance_only") === "on",
    salary_min_inr: salaryLakh > 0 ? salaryLakh * 100000 : null,
    employment_types: fd.getAll("employment_types").map(String).filter((t) => TYPES.includes(t)),
    channels: ["in_app"],
  };
  const { error } = await sb!.from("job_alerts").insert(alert);
  if (error) return { ok: false, message: "Couldn’t save the alert. Try again." };
  revalidatePath("/jobs/alerts");
  return { ok: true, message: "Alert created. Matching new jobs will appear in your notifications." };
}

export async function deleteAlert(fd: FormData) {
  const sb = await supabaseServer();
  await sb?.from("job_alerts").delete().eq("id", String(fd.get("id")));
  revalidatePath("/jobs/alerts");
}

export async function toggleAlert(fd: FormData) {
  const sb = await supabaseServer();
  await sb?.from("job_alerts").update({ is_active: fd.get("active") === "true" }).eq("id", String(fd.get("id")));
  revalidatePath("/jobs/alerts");
}
