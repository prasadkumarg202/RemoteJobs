import type {
  AiRelevance, BudgetType, EligibilityType, EmploymentType, IndiaEligibility, JobDuration, JobSection, RiskLevel, SalaryPeriod, Seniority, WorkMode,
} from "@engine/types.ts";

export type { JobSection };

/** Shape returned by public.job_card_json / search_jobs. */
export interface JobCard {
  id: string;
  slug: string;
  title: string;
  company_name: string;
  company_logo: string | null;
  short_description: string;
  category: string | null;
  subcategory: string | null;
  employment_type: EmploymentType;
  work_mode: WorkMode;
  country: string | null;
  city: string | null;
  state: string | null;
  location_text: string | null;
  eligibility_type: EligibilityType;
  eligible_countries: string[];
  eligible_regions: string[];
  india_eligibility: IndiaEligibility;
  timezone_requirements: string[];
  remote_worldwide: boolean;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: SalaryPeriod | null;
  salary_inr_min: number | null;
  salary_inr_max: number | null;
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
  ai_relevance: AiRelevance;
  ai_category: string | null;
  job_duration: JobDuration;
  posted_at: string;
  expires_at: string | null;
  source_name: string;
  source_count: number;
  risk_level: RiskLevel;
  is_featured: boolean;
  is_verified: boolean;
  application_method: "external" | "email" | "whatsapp" | "phone";
}

export interface JobSourceLink {
  name: string;
  slug: string;
  external_url: string;
  attribution_text: string | null;
  allow_structured_data: boolean;
  is_primary: boolean;
}

export interface JobDetail extends JobCard {
  description: string;
  description_html: string | null;
  external_url: string;
  apply_url: string;
  apply_email: string | null;
  apply_whatsapp: string | null;
  source_id: string | null;
  is_government: boolean;
  risk_flags: string[];
  moderation_status: string;
  is_active: boolean;
  sources: JobSourceLink[];
}

export type IndiaMode = "india_only" | "india_apac" | "worldwide" | "eligible" | "any";
export type SortMode = "relevance" | "newest" | "salary";

export interface JobFilters {
  q?: string;
  sections?: JobSection[];
  india?: IndiaMode;
  country?: string;
  regions?: string[];
  categories?: string[];
  aiCategories?: string[];
  aiMin?: number;
  types?: string[];
  modes?: string[];
  seniority?: string[];
  salaryMinInr?: number;
  budgetTypes?: string[];
  durations?: string[];
  postedWithin?: number;
  sources?: string[];
  city?: string;
  excludeIds?: string[];
  sort?: SortMode;
  page?: number;
  limit?: number;
}

export interface SearchResult {
  total: number;
  items: JobCard[];
}
