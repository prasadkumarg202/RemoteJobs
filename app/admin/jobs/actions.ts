"use server";
import { revalidatePath } from "next/cache";
import { SUPABASE_URL } from "@/lib/env";
import { isAdmin, supabaseServer } from "@/lib/supabase/server";

async function adminDb() {
  if (!(await isAdmin())) throw new Error("not authorized");
  return (await supabaseServer())!;
}

export async function runSyncNow(fd: FormData) {
  await adminDb();
  const slug = String(fd.get("slug"));
  if (!/^[a-z0-9-]+$/.test(slug)) return;
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is not set on the server");
  // No force flag: the source's enabled flag and minimum polling interval still apply.
  await fetch(`${SUPABASE_URL}/functions/v1/sync-${slug}`, { method: "POST", headers: { "x-cron-secret": secret } }).catch(() => undefined);
  revalidatePath("/admin/jobs");
}

export async function setSourceEnabled(fd: FormData) {
  const db = await adminDb();
  const patch: Record<string, unknown> = { enabled: fd.get("enabled") === "true" };
  if (patch.enabled && fd.get("terms_ack") === "on") patch.terms_verified_at = new Date().toISOString();
  await db.from("job_sources").update(patch).eq("id", String(fd.get("id")));
  revalidatePath("/admin/jobs");
}

export async function updateRate(fd: FormData) {
  const db = await adminDb();
  const currency = String(fd.get("currency")).toUpperCase();
  const rate = Number(fd.get("rate"));
  if (!/^[A-Z]{3}$/.test(currency) || !(rate > 0)) return;
  await db.from("exchange_rates").upsert({ currency, inr_per_unit: rate, source: "admin", updated_at: new Date().toISOString() });
  revalidatePath("/admin/jobs");
}

export async function moderateJob(fd: FormData) {
  const db = await adminDb();
  const user = (await db.auth.getUser()).data.user;
  const decision = String(fd.get("decision"));
  const id = String(fd.get("id"));
  const base = { moderated_by: user?.id, moderated_at: new Date().toISOString(), moderation_note: String(fd.get("note") ?? "").slice(0, 500) || null };
  if (decision === "approve") await db.from("jobs").update({ ...base, moderation_status: "approved", is_active: true, is_verified: fd.get("verified") === "on" }).eq("id", id);
  if (decision === "reject") await db.from("jobs").update({ ...base, moderation_status: "rejected", is_active: false }).eq("id", id);
  if (decision === "feature") await db.from("jobs").update({ is_featured: fd.get("on") === "true" }).eq("id", id);
  revalidatePath("/admin/jobs/moderation");
  revalidatePath("/admin/jobs");
}

export async function resolveReport(fd: FormData) {
  const db = await adminDb();
  await db.from("job_reports").update({ status: String(fd.get("status")) === "dismissed" ? "dismissed" : "reviewed" }).eq("id", String(fd.get("id")));
  revalidatePath("/admin/jobs/moderation");
}
