"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

type Result = { ok: true; on?: boolean } | { ok: false; reason: "auth" | "error"; message?: string };

async function user() {
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ? { sb, id: data.user.id } : null;
}

export async function toggleSaveJob(jobId: string): Promise<Result> {
  const u = await user();
  if (!u) return { ok: false, reason: "auth" };
  const { data: existing } = await u.sb.from("saved_jobs").select("job_id").eq("user_id", u.id).eq("job_id", jobId).maybeSingle();
  const res = existing
    ? await u.sb.from("saved_jobs").delete().eq("user_id", u.id).eq("job_id", jobId)
    : await u.sb.from("saved_jobs").insert({ user_id: u.id, job_id: jobId });
  if (res.error) return { ok: false, reason: "error", message: res.error.message };
  revalidatePath("/jobs/saved");
  return { ok: true, on: !existing };
}

export async function setHidden(jobId: string, hidden: boolean): Promise<Result> {
  const u = await user();
  if (!u) return { ok: false, reason: "auth" };
  const res = hidden
    ? await u.sb.from("hidden_jobs").upsert({ user_id: u.id, job_id: jobId })
    : await u.sb.from("hidden_jobs").delete().eq("user_id", u.id).eq("job_id", jobId);
  if (res.error) return { ok: false, reason: "error", message: res.error.message };
  return { ok: true, on: hidden };
}

/** Merge device-saved jobs into the account after sign-in. */
export async function importDeviceSaved(ids: string[]): Promise<Result> {
  const u = await user();
  if (!u) return { ok: false, reason: "auth" };
  const rows = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200).map((job_id) => ({ user_id: u.id, job_id }));
  if (rows.length) await u.sb.from("saved_jobs").upsert(rows, { ignoreDuplicates: true });
  return { ok: true };
}
