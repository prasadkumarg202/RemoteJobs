// RawJob → NormalizedJob: parse, normalize, classify, score, hash.

import { classifyCategories, classifyDuration, classifyEmploymentType, classifySeniority, scoreAi } from "./classify.ts";
import { resolveEligibility } from "./eligibility.ts";
import { assessRisk } from "./risk.ts";
import { annualize, buildSalary, deriveBudget, toInr } from "./salary.ts";
import {
  canonicalizeUrl, htmlToText, isHttpUrl, normalizeCompany, normalizeTitle, sha256Hex, shortHash, slugify, toIsoDate,
  truncateWords, uniq,
} from "./text.ts";
import type { ExchangeRates, JobSection, NormalizedJob, RawJob } from "./types.ts";

export interface NormalizeContext {
  sourceId: string | null;
  sourceSlug: string;
  sourceName: string;
  rates: ExchangeRates;
  /** Third-party job boards (vs. user-submitted employer jobs). */
  trustedSource: boolean;
  now?: Date;
}

export class InvalidJobError extends Error {}


export function computeSections(j: Pick<NormalizedJob, "work_mode" | "ai_score" | "employment_type" | "india_eligibility" | "category" | "is_government" | "city">): JobSection[] {
  const s: JobSection[] = [];
  const remote = j.work_mode === "remote";
  const indiaOk = ["explicit", "worldwide", "region", "timezone"].includes(j.india_eligibility);
  if (remote) s.push("remote");
  if (j.ai_score >= 40) s.push("ai");
  if (["freelance", "gig", "contract"].includes(j.employment_type)) s.push("freelance");
  // Work From Home: remote work an India-based person can actually take, that suits flexible/non-specialist profiles.
  const flexible = ["part_time", "freelance", "gig", "internship"].includes(j.employment_type);
  if (remote && indiaOk && (flexible || j.category === "business" || j.category === "creative")) s.push("wfh");
  if (!remote && (j.work_mode === "onsite" || j.work_mode === "hybrid") && j.city) s.push("local");
  if (j.is_government) s.push("government");
  return s;
}

export async function normalizeJob(raw: RawJob, ctx: NormalizeContext): Promise<{ job: NormalizedJob; salaryIssues: string[] }> {
  const title = htmlToText(raw.title).replace(/\s+/g, " ").trim();
  if (!title) throw new InvalidJobError("missing title");
  if (!raw.sourceJobId) throw new InvalidJobError("missing source job id");
  if (!isHttpUrl(raw.externalUrl)) throw new InvalidJobError("missing or invalid external url");

  const now = ctx.now ?? new Date();
  const company = htmlToText(raw.companyName ?? "").replace(/\s+/g, " ").trim() || "Company not disclosed";
  const description = htmlToText(raw.descriptionHtml ?? raw.excerpt ?? "");
  const excerpt = htmlToText(raw.excerpt ?? "") || description;
  const tags = uniq((raw.tags ?? []).map((t) => String(t).trim()).filter(Boolean)).slice(0, 25);
  const categoriesRaw = (raw.categoriesRaw ?? []).map((c) => String(c).replace(/[-_]/g, " ").trim()).filter(Boolean);

  const cat = classifyCategories({ title, description, tags, categoriesRaw, companyName: company });
  const ai = scoreAi({ title, description, tags, companyName: company }, cat.matched);
  const typeHints = raw.employmentTypeRaw ?? tags.filter((t) => /free-?lanc|contract|part[\s_-]?time|full[\s_-]?time|intern|(?<![a-z])gig|temporary/i.test(t));
  let employment_type = classifyEmploymentType(typeHints, title, description);
  const sal = buildSalary(raw, ctx.rates);
  // A fixed project budget means freelance work even when the board labels it "full time".
  if (sal.period === "project" && (employment_type === "full_time" || employment_type === "part_time")) employment_type = "freelance";
  const job_duration = classifyDuration(`${title}\n${description.slice(0, 3000)}`, employment_type);
  const sen = classifySeniority(raw.seniorityRaw, title, description);
  const elig = resolveEligibility({
    title, description, locationRaw: raw.locationRaw, countriesRaw: raw.countriesRaw, timezonesRaw: raw.timezonesRaw,
    workModeHint: raw.workModeHint, city: raw.city, state: raw.state, country: raw.country,
  });

  const budget = deriveBudget(sal, employment_type);
  const salary_inr_min = toInr(sal.min, sal.currency, ctx.rates);
  const salary_inr_max = toInr(sal.max, sal.currency, ctx.rates);

  const applyUrl = isHttpUrl(raw.applyUrl) ? raw.applyUrl! : raw.externalUrl;
  const canonical_url = canonicalizeUrl(applyUrl);

  const posted = toIsoDate(raw.postedAt) ?? now.toISOString();
  // Clamp future-dated posts (clock skew) to now.
  const posted_at = new Date(posted) > now ? now.toISOString() : posted;
  const expires_at = toIsoDate(raw.expiresAt);

  const normalized_title = normalizeTitle(title);
  const normalized_company = normalizeCompany(company);
  const normalized_location = elig.work_mode === "remote" ? "remote" : (elig.city ?? elig.country ?? elig.location_text ?? "").toLowerCase();
  const content_hash = await sha256Hex(`${normalized_title}|${normalized_company}|${normalized_location}`);

  const application_method: NormalizedJob["application_method"] =
    raw.applyUrl || ctx.trustedSource ? "external" : raw.applyEmail ? "email" : raw.applyWhatsapp ? "whatsapp" : raw.applyPhone ? "phone" : "external";

  const risk = assessRisk({
    title, description, companyName: company,
    applyUrl: application_method === "external" ? applyUrl : null,
    applyEmail: raw.applyEmail, applyWhatsapp: raw.applyWhatsapp, applyPhone: raw.applyPhone,
    salaryIssues: sal.issues, expiresAt: expires_at, trustedSource: ctx.trustedSource,
  });

  const keywords = uniq([...cat.matched, ...tags.map((t) => slugify(t, 40))]).slice(0, 40);
  const is_government = !!raw.isGovernment;

  const base = {
    work_mode: elig.work_mode, ai_score: ai.score, employment_type, india_eligibility: elig.india_eligibility,
    category: cat.category, is_government, city: elig.city,
  };
  const sections = computeSections(base);

  const expired = !!expires_at && new Date(expires_at) < now;
  const needsModeration = !ctx.trustedSource || risk.level === "high";

  const job: NormalizedJob = {
    slug: `${slugify(title, 50)}-${slugify(company, 30)}-${shortHash(`${ctx.sourceSlug}:${raw.sourceJobId}`)}`,
    source_id: ctx.sourceId,
    source_name: ctx.sourceName,
    source_job_id: String(raw.sourceJobId),
    external_url: raw.externalUrl,
    apply_url: applyUrl,
    canonical_url,
    title,
    company_name: company,
    company_logo: isHttpUrl(raw.companyLogo) ? raw.companyLogo! : null,
    description,
    description_html: raw.descriptionHtml ?? null,
    short_description: truncateWords(excerpt, 280),
    category: cat.category,
    subcategory: cat.subcategory,
    employment_type,
    work_mode: elig.work_mode,
    country: elig.country,
    state: elig.state,
    city: elig.city,
    region: elig.region,
    location_text: elig.location_text,
    remote_allowed: elig.remote_allowed,
    remote_worldwide: elig.remote_worldwide,
    eligibility_type: elig.eligibility_type,
    eligible_countries: elig.eligible_countries,
    eligible_regions: elig.eligible_regions,
    india_eligibility: elig.india_eligibility,
    timezone: elig.timezone,
    timezone_requirements: elig.timezone_requirements,
    salary_min: sal.min,
    salary_max: sal.max,
    salary_currency: sal.currency,
    salary_period: sal.period,
    salary_inr_min,
    salary_inr_max,
    salary_inr_annual_max: annualize(salary_inr_max ?? salary_inr_min, sal.period),
    ...budget,
    experience_min: sen.experienceMin,
    experience_max: sen.experienceMax,
    seniority: sen.seniority,
    skills: cat.skills,
    keywords,
    sections,
    ai_score: ai.score,
    ai_category: ai.aiCategory,
    ai_relevance: ai.relevance,
    job_duration,
    posted_at,
    expires_at,
    is_active: !expired && !needsModeration,
    is_featured: false,
    is_verified: false,
    is_government,
    moderation_status: expired ? "expired" : needsModeration ? "pending" : "approved",
    risk_score: risk.score,
    risk_level: risk.level,
    risk_flags: elig.restriction_conflict ? [...risk.flags, "eligibility_conflict"] : risk.flags,
    normalized_title,
    normalized_company,
    normalized_location,
    content_hash,
    application_method,
    apply_email: raw.applyEmail ?? null,
    apply_whatsapp: raw.applyWhatsapp ?? null,
  };
  return { job, salaryIssues: sal.issues };
}
