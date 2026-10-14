"use server";
import { employerSubmissionToRaw, normalizeJob, type EmployerSubmission } from "@engine";
import { SITE_URL } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export interface PostState { ok: boolean; message: string; errors?: Record<string, string> }

const WORK = ["remote", "hybrid", "onsite"] as const;
const TYPES = ["full_time", "part_time", "contract", "temporary", "freelance", "gig", "internship"] as const;
const METHODS = ["whatsapp", "email", "external_url"] as const;

export async function submitJob(_: PostState | null, fd: FormData): Promise<PostState> {
  const sb = await supabaseServer();
  const admin = supabaseAdmin();
  if (!sb || !admin) return { ok: false, message: "Posting jobs needs Supabase to be configured." };
  const user = (await sb.auth.getUser()).data.user;
  if (!user) return { ok: false, message: "Sign in with your mobile number first." };
  if (!user.phone) return { ok: false, message: "Verify your mobile number with OTP before posting a job." };

  const s = (k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
  const errors: Record<string, string> = {};
  const title = s("title", 120);
  const description = s("description", 8000);
  const company = s("company", 120);
  const name = s("name", 80);
  const workMode = s("work_mode") as (typeof WORK)[number];
  const employmentType = s("employment_type") as (typeof TYPES)[number];
  const method = s("application_method") as (typeof METHODS)[number];
  const applyEmail = s("apply_email", 120);
  const applyWhatsapp = s("apply_whatsapp", 20).replace(/[^\d+]/g, "");
  const applyUrl = s("apply_url", 500);
  const salaryMin = Number(s("salary_min")) || null;
  const salaryMax = Number(s("salary_max")) || null;

  if (title.length < 4) errors.title = "Enter a job title.";
  if (description.length < 80) errors.description = "Describe the job in at least 80 characters: work, timings, requirements.";
  if (!company) errors.company = "Enter the business name.";
  if (!name) errors.name = "Enter your name.";
  if (!WORK.includes(workMode)) errors.work_mode = "Choose a work mode.";
  if (!TYPES.includes(employmentType)) errors.employment_type = "Choose a job type.";
  if (workMode !== "remote" && !s("city")) errors.city = "Enter the city for on-site or hybrid jobs.";
  if (!METHODS.includes(method)) errors.application_method = "Choose how candidates apply.";
  if (method === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applyEmail)) errors.apply_email = "Enter a valid email.";
  if (method === "whatsapp" && applyWhatsapp.replace(/\D/g, "").length < 10) errors.apply_whatsapp = "Enter a WhatsApp number.";
  if (method === "external_url" && !/^https?:\/\//.test(applyUrl)) errors.apply_url = "Enter a link starting with https://";
  if (salaryMin && salaryMax && salaryMin > salaryMax) errors.salary_max = "Maximum must be more than minimum.";
  if (fd.get("terms") !== "on") errors.terms = "Accept the terms to continue.";
  if (fd.get("privacy") !== "on") errors.privacy = "Accept the privacy policy to continue.";
  if (Object.keys(errors).length) return { ok: false, message: "Fix the highlighted fields.", errors };

  // Simple abuse limit: 5 submissions per user per day.
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin.from("jobs").select("id", { count: "exact", head: true }).eq("submitted_by", user.id).gte("created_at", since);
  if ((count ?? 0) >= 5) return { ok: false, message: "You’ve posted 5 jobs today. Try again tomorrow." };

  const { data: source } = await admin.from("job_sources").select("id,slug,name").eq("slug", "employer").single();
  const { data: rates } = await admin.from("exchange_rates").select("currency,inr_per_unit");
  const submissionId = crypto.randomUUID();
  const sub: EmployerSubmission = {
    submissionId, contactName: name, companyName: company, title, description,
    salaryMin, salaryMax, salaryCurrency: "INR", salaryPeriod: s("salary_period") || "monthly",
    city: s("city", 60) || null, state: s("state", 60) || null, country: "India",
    workMode, employmentType, skills: s("skills", 300).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 15),
    applicationMethod: method, applyEmail, applyWhatsapp, applyUrl,
  };
  const { job } = await normalizeJob(employerSubmissionToRaw(sub, SITE_URL), {
    sourceId: source!.id, sourceSlug: "employer", sourceName: source!.name,
    rates: Object.fromEntries((rates ?? []).map((r) => [r.currency, Number(r.inr_per_unit)])), trustedSource: false,
  });

  // Duplicate of a live job? Flag for the moderator rather than reject.
  const { data: dup } = await admin.from("jobs").select("id").eq("content_hash", job.content_hash).eq("is_active", true).limit(1);
  const flags = dup?.length ? [...job.risk_flags, "duplicate"] : job.risk_flags;

  const { data: inserted, error } = await admin.from("jobs").insert({
    ...job, risk_flags: flags, is_active: false, moderation_status: "pending", submitted_by: user.id,
  }).select("id").single();
  if (error) return { ok: false, message: "Couldn’t submit the job. Try again in a minute." };
  await admin.from("job_sources_mapping").insert({ job_id: inserted.id, source_id: source!.id, external_job_id: submissionId, external_url: job.external_url, is_primary: true });
  const now = new Date().toISOString();
  await admin.from("job_submission_contacts").insert({ job_id: inserted.id, user_id: user.id, contact_name: name, contact_phone: user.phone, terms_accepted_at: now, privacy_accepted_at: now });
  return { ok: true, message: "submitted" };
}
