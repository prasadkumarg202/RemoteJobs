// Shared types for the Mana Kosamu job engine.
// This folder is plain TypeScript with relative `.ts` imports only, so the same
// code runs in Supabase Edge Functions (Deno), Next.js (Node) and Vitest.

export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "temporary"
  | "freelance"
  | "gig"
  | "internship";

export type WorkMode = "remote" | "hybrid" | "onsite" | "unknown";

export type JobDuration =
  | "one_time"
  | "less_than_1_month"
  | "1_to_3_months"
  | "3_to_6_months"
  | "6_plus_months"
  | "ongoing"
  | "unknown";

export type EligibilityType =
  | "worldwide"
  | "country_specific"
  | "region_specific"
  | "timezone_specific"
  | "unknown";

/** How a remote job relates to candidates living in India. */
export type IndiaEligibility =
  | "explicit" // India listed by the source
  | "worldwide" // source says worldwide / anywhere, no conflicting restriction
  | "region" // APAC / Asia / South Asia listed by the source
  | "timezone" // timezone window includes IST (UTC+5:30)
  | "not_eligible" // source restricts to places that exclude India
  | "unknown";

export type SalaryPeriod = "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "project" | "unknown";

export type BudgetType = "fixed_price" | "hourly" | "monthly" | "unknown";

export type RiskLevel = "low" | "medium" | "high";

export type ModerationStatus = "pending" | "approved" | "rejected" | "expired";

export type AiRelevance = "strong_ai" | "ai_related" | "ai_automation" | "general";

export type Seniority = "entry" | "mid" | "senior" | "lead" | "any";

export type JobSection = "local" | "remote" | "ai" | "freelance" | "wfh" | "government";

export type SourceType = "api" | "rss" | "manual" | "employer" | "mcp";

/** What a source adapter produces, before normalization. Every field except ids/title is optional. */
export interface RawJob {
  sourceJobId: string;
  /** Listing page on the source website (used for attribution "View on X"). */
  externalUrl: string;
  /** Direct application URL if the source gives one; falls back to externalUrl. */
  applyUrl?: string | null;
  title: string;
  companyName?: string | null;
  companyLogo?: string | null;
  descriptionHtml?: string | null;
  excerpt?: string | null;
  employmentTypeRaw?: string | string[] | null;
  /** Free-text location ("USA", "Anywhere", "APAC, EMEA", "Hyderabad"). */
  locationRaw?: string | null;
  /** Structured country restrictions provided by the source (names or ISO codes). */
  countriesRaw?: string[] | null;
  /** Structured timezone restrictions (e.g. ["UTC-5", "UTC+1"] or [-5, 1]). */
  timezonesRaw?: Array<string | number> | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriodRaw?: string | null;
  /** Free-text salary if the source only has a string. */
  salaryText?: string | null;
  tags?: string[] | null;
  categoriesRaw?: string[] | null;
  seniorityRaw?: string | null;
  postedAt?: string | number | Date | null;
  expiresAt?: string | number | Date | null;
  workModeHint?: WorkMode | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  /** Employer submissions only. */
  applyEmail?: string | null;
  applyWhatsapp?: string | null;
  applyPhone?: string | null;
  isGovernment?: boolean;
}

/** A row ready to insert into public.jobs (snake_case mirrors the DB). */
export interface NormalizedJob {
  slug: string;
  source_id: string | null;
  source_name: string;
  source_job_id: string;
  external_url: string;
  apply_url: string;
  canonical_url: string;

  title: string;
  company_name: string;
  company_logo: string | null;
  description: string; // sanitized-safe plain text with paragraph breaks
  description_html: string | null; // original HTML from the source (sanitized again at render time)
  short_description: string;

  category: string | null;
  subcategory: string | null;
  employment_type: EmploymentType;
  work_mode: WorkMode;

  country: string | null;
  state: string | null;
  city: string | null;
  region: string | null;
  location_text: string | null;

  remote_allowed: boolean;
  remote_worldwide: boolean;
  eligibility_type: EligibilityType;
  eligible_countries: string[];
  eligible_regions: string[];
  india_eligibility: IndiaEligibility;
  timezone: string | null;
  timezone_requirements: string[];

  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: SalaryPeriod | null;
  salary_inr_min: number | null;
  salary_inr_max: number | null;
  salary_inr_annual_max: number | null;

  budget_type: BudgetType | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_currency: string | null;
  budget_period: SalaryPeriod | null;

  experience_min: number | null;
  experience_max: number | null;
  seniority: Seniority;

  skills: string[];
  keywords: string[];
  sections: JobSection[];

  ai_score: number;
  ai_category: string | null;
  ai_relevance: AiRelevance;

  job_duration: JobDuration;

  posted_at: string;
  expires_at: string | null;

  is_active: boolean;
  is_featured: boolean;
  is_verified: boolean;
  is_government: boolean;
  moderation_status: ModerationStatus;
  risk_score: number;
  risk_level: RiskLevel;
  risk_flags: string[];

  normalized_title: string;
  normalized_company: string;
  normalized_location: string;
  content_hash: string;

  application_method: "external" | "email" | "whatsapp" | "phone";
  apply_email: string | null;
  apply_whatsapp: string | null;
}

export interface ExistingJobRef {
  id: string;
  source_id: string | null;
  canonical_url: string;
  content_hash: string;
  normalized_title: string;
  normalized_company: string;
  short_description: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  posted_at: string;
  company_logo: string | null;
  is_active: boolean;
}

export interface SourceConfig {
  id: string;
  slug: string;
  name: string;
  source_type: SourceType;
  base_url: string | null;
  api_url: string | null;
  rss_url: string | null;
  enabled: boolean;
  min_interval_minutes: number;
  retention_days: number;
  full_feed: boolean;
  last_run_at: string | null;
  config: Record<string, unknown>;
  http_cache: Record<string, unknown>;
}

export type ExchangeRates = Record<string, number>; // currency -> INR per 1 unit

export interface SyncResult {
  source: string;
  started_at: string;
  completed_at: string;
  jobs_found: number;
  jobs_added: number;
  jobs_updated: number;
  jobs_skipped: number;
  jobs_duplicates: number;
  jobs_expired: number;
  jobs_flagged: number;
  used_fallback: boolean;
  not_modified: boolean;
  skipped_reason?: string;
  errors: string[];
}
