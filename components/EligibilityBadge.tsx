import type { Dict } from "@/lib/i18n";
import { indiaEligibility } from "@/lib/jobs/format";
import type { JobCard } from "@/lib/jobs/types";

const TONE = {
  open: "bg-leaf-soft text-leaf",
  partial: "bg-turmeric-soft text-turmeric-ink",
  closed: "bg-closed-soft text-ink-faint",
  unknown: "bg-closed-soft text-ink-soft",
} as const;

export function EligibilityBadge({ job, t }: { job: Pick<JobCard, "india_eligibility" | "work_mode" | "eligible_regions" | "timezone_requirements">; t: Dict }) {
  const e = indiaEligibility(job, t);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 t-tiny font-medium ${TONE[e.tone]}`}>
      {e.tone === "open" && <span aria-hidden>🇮🇳</span>}
      {e.label}
    </span>
  );
}

export function railClass(job: Pick<JobCard, "india_eligibility" | "work_mode" | "eligible_regions" | "timezone_requirements">, t: Dict) {
  return `rail-${indiaEligibility(job, t).tone}`;
}
