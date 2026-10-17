"use server";
import { revalidatePath } from "next/cache";
import { getPartner, isValidAffiliateUrl, PLACEMENTS } from "@/lib/affiliates/catalog";
import { normalizeJob, parseBoardLines } from "@engine";
import { checkOfficialUrl, GOV_ORG_BY_SLUG, govToRaw, validateGov, type GovNotificationInput, type GovScope } from "@/lib/jobs/government";
import { SUPABASE_URL } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAdmin, supabaseServer } from "@/lib/supabase/server";

async function adminDb() {
  if (!(await isAdmin())) throw new Error("not authorized");
  return (await supabaseServer())!;
}

export async function runSyncNow(fd: FormData) {
  await adminDb();
  const slug = String(fd.get("slug"));
  if (!/^[a-z0-9-]+$/.test(slug)) return;
  // Works on Supabase (Edge Function accepts the service-role key or CRON_SECRET) and on AapStack
  // (/p/<project>/functions/v1/<slug>, called with the service-role key → role service_role).
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.CRON_SECRET;
  if (!serviceKey && !secret) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY (or CRON_SECRET) on the server");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (serviceKey) Object.assign(headers, { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` });
  if (secret) headers["x-cron-secret"] = secret;
  // No force flag: the source's enabled flag and minimum polling interval still apply.
  await fetch(`${SUPABASE_URL}/functions/v1/sync-${slug}`, { method: "POST", headers, body: "{}" }).catch(() => undefined);
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

export async function saveAffiliate(fd: FormData) {
  const db = await adminDb();
  const slug = String(fd.get("slug"));
  if (!getPartner(slug)) return;
  const url = String(fd.get("url") ?? "").trim();
  if (url && !isValidAffiliateUrl(url)) throw new Error("Link must be a full https:// address");
  const placements = fd.getAll("placements").map(String).filter((p) => (PLACEMENTS as string[]).includes(p));
  const user = (await db.auth.getUser()).data.user;
  await db.from("affiliate_partners").upsert({
    slug,
    url: url || null,
    enabled: fd.get("enabled") === "on" && !!url,
    placements: placements.length ? placements : null,
    note: String(fd.get("note") ?? "").slice(0, 500) || null,
    updated_at: new Date().toISOString(),
    updated_by: user?.id ?? null,
  });
  revalidatePath("/admin/jobs/affiliates");
  revalidatePath("/jobs", "layout");
}

export interface GovFormState { ok: boolean; message: string; errors?: Record<string, string>; slug?: string }

export async function createGovNotification(_: GovFormState | null, fd: FormData): Promise<GovFormState> {
  await adminDb();
  const admin = supabaseAdmin();
  if (!admin) return { ok: false, message: "Needs SUPABASE_SERVICE_ROLE_KEY on the server." };
  const s = (k: string, max = 300) => String(fd.get(k) ?? "").trim().slice(0, max);
  const vac = s("vacancies", 10);
  const input: GovNotificationInput = {
    id: crypto.randomUUID(),
    orgSlug: s("org", 20), orgName: s("org_name", 150) || null, scope: s("scope", 2) as GovScope,
    district: s("district", 40) || null, postName: s("post_name", 150), notificationNo: s("notification_no", 80) || null,
    vacancies: vac ? Number(vac) : null, qualification: s("qualification", 500) || null, ageLimit: s("age_limit", 150) || null,
    fee: s("fee", 300) || null, salaryText: s("pay", 150) || null, startDate: s("start_date", 10) || null, lastDate: s("last_date", 10),
    notificationUrl: s("notification_url", 1000), applyUrl: s("apply_url", 1000) || null, details: s("details", 6000) || null,
  };
  const allowUnofficial = fd.get("unofficial_ok") === "on";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const errors = validateGov(input, { allowUnofficial, today });
  if (Object.keys(errors).length) return { ok: false, message: "Fix the highlighted fields.", errors: errors as Record<string, string> };

  const { data: source } = await admin.from("job_sources").select("id,name").eq("slug", "manual").single();
  if (!source) return { ok: false, message: "The 'manual' job source is missing — run the seed migration." };
  const { job } = await normalizeJob(govToRaw(input), { sourceId: source.id, sourceSlug: "manual", sourceName: source.name, rates: { INR: 1 }, trustedSource: true });

  const { data: dup } = await admin.from("jobs").select("slug").eq("content_hash", job.content_hash).eq("is_active", true).limit(1);
  if (dup?.length) return { ok: false, message: "This notification is already live.", slug: dup[0].slug };

  const official = !allowUnofficial || [input.notificationUrl, input.applyUrl].every((u) => !u || checkOfficialUrl(u, GOV_ORG_BY_SLUG[input.orgSlug]).ok);
  const user = (await (await supabaseServer())!.auth.getUser()).data.user;
  const { data: inserted, error } = await admin.from("jobs").insert({
    ...job,
    // Entered by an admin from the official portal: fee/age wording in a real notification is not a scam signal.
    risk_flags: official ? [] : ["suspicious_domain"], risk_level: official ? "low" : "medium", risk_score: official ? 0 : 30,
    is_verified: official, is_active: true, moderation_status: "approved",
    submitted_by: user?.id ?? null, moderated_by: user?.id ?? null, moderated_at: new Date().toISOString(),
  }).select("id,slug").single();
  if (error) return { ok: false, message: `Couldn't save: ${error.message}` };
  await admin.from("job_sources_mapping").insert({ job_id: inserted.id, source_id: source.id, external_job_id: job.source_job_id, external_url: job.external_url, is_primary: true });
  revalidatePath("/admin/jobs/government");
  revalidatePath("/jobs/government");
  return { ok: true, message: "Published.", slug: inserted.slug };
}

export async function closeGovNotification(fd: FormData) {
  const db = await adminDb();
  await db.from("jobs").update({ is_active: false, expires_at: new Date().toISOString() }).eq("id", String(fd.get("id"))).eq("is_government", true);
  revalidatePath("/admin/jobs/government");
  revalidatePath("/jobs/government");
}

export interface BoardsState { ok: boolean; message: string }

/** Saves the Greenhouse / Lever / Ashby company board list (one "token | Company | eu" per line). */
export async function saveBoards(_: BoardsState | null, fd: FormData): Promise<BoardsState> {
  const db = await adminDb();
  const slug = String(fd.get("slug"));
  if (slug !== "greenhouse" && slug !== "lever" && slug !== "ashby") return { ok: false, message: "Unknown source" };
  const { boards, errors } = parseBoardLines(String(fd.get("boards") ?? "").slice(0, 20000));
  if (errors.length) return { ok: false, message: errors.slice(0, 5).join(" · ") };
  const { data: src } = await db.from("job_sources").select("config").eq("slug", slug).single();
  const config = { ...((src?.config as Record<string, unknown>) ?? {}), boards, location_filter: fd.get("all_locations") === "on" ? "all" : "india_or_remote" };
  // The source only runs while it has boards (an empty list would just report an error every run).
  const { error } = await db.from("job_sources").update({ config, enabled: boards.length > 0, ...(boards.length ? { terms_verified_at: new Date().toISOString() } : {}) }).eq("slug", slug);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/jobs");
  return { ok: true, message: `Saved ${boards.length} board${boards.length === 1 ? "" : "s"}. They are fetched on the next scheduled sync (or press “Run sync”).` };
}
