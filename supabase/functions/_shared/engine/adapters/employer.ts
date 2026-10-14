// Jobs posted directly on Mana Kosamu by employers. Not a feed: submissions are
// converted to RawJob and run through the same normalize/classify/risk pipeline,
// then held for moderation (status "pending").

import type { EmploymentType, RawJob, WorkMode } from "../types.ts";
import type { FetchResult, SourceAdapter } from "./base.ts";

export interface EmployerSubmission {
  submissionId: string;
  contactName: string;
  companyName: string;
  title: string;
  description: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  workMode: WorkMode;
  employmentType: EmploymentType;
  skills?: string[];
  applicationMethod: "whatsapp" | "email" | "external_url";
  applyWhatsapp?: string | null;
  applyEmail?: string | null;
  applyUrl?: string | null;
  isGovernment?: boolean;
  expiresAt?: string | null;
}

export function employerSubmissionToRaw(s: EmployerSubmission, siteUrl: string): RawJob {
  const listing = `${siteUrl.replace(/\/$/, "")}/jobs/employer/${s.submissionId}`;
  return {
    sourceJobId: s.submissionId,
    externalUrl: listing,
    applyUrl: s.applicationMethod === "external_url" ? s.applyUrl ?? null : null,
    title: s.title,
    companyName: s.companyName,
    descriptionHtml: s.description.replace(/</g, "&lt;").replace(/\n/g, "<br>"),
    employmentTypeRaw: s.employmentType,
    locationRaw: [s.city, s.state, s.country].filter(Boolean).join(", ") || null,
    city: s.city ?? null,
    state: s.state ?? null,
    country: s.country ?? "India",
    workModeHint: s.workMode,
    salaryMin: s.salaryMin ?? null,
    salaryMax: s.salaryMax ?? null,
    salaryCurrency: s.salaryCurrency ?? "INR",
    salaryPeriodRaw: s.salaryPeriod ?? null,
    tags: s.skills ?? [],
    applyEmail: s.applicationMethod === "email" ? s.applyEmail ?? null : null,
    applyWhatsapp: s.applicationMethod === "whatsapp" ? s.applyWhatsapp ?? null : null,
    isGovernment: !!s.isGovernment,
    expiresAt: s.expiresAt ?? null,
  };
}

export class EmployerSubmissionAdapter implements SourceAdapter {
  readonly slug = "employer";
  readonly name = "Mana Kosamu Employer";
  fetchJobs(): Promise<FetchResult> {
    return Promise.resolve({ jobs: [], usedFallback: false, notModified: false, warnings: ["Employer jobs arrive via the Post a Job form, not a sync"] });
  }
}
