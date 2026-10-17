import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import { payLabel, postedAgo, typeLabel, whereLabel } from "@/lib/jobs/format";
import type { JobCard as Job } from "@/lib/jobs/types";
import { CompanyLogo } from "./CompanyLogo";
import { EligibilityBadge, railClass } from "./EligibilityBadge";
import { IconGlobe, IconPin, IconShield } from "./icons";
import { SaveButton } from "./SaveButton";
import { SourceBadge } from "./SourceBadge";

export function JobCard({ job, t, saved = false }: { job: Job; t: Dict; saved?: boolean }) {
  const pay = payLabel(job);
  const isAi = job.ai_relevance === "strong_ai" || job.ai_relevance === "ai_related";
  const tags = job.skills.slice(0, 4);
  return (
    <article className={`relative rounded-[var(--radius-card)] border border-line bg-surface p-4 pl-5 ${railClass(job, t)}`}>
      <div className="flex gap-3">
        <CompanyLogo src={job.company_logo} name={job.company_name} />
        <div className="min-w-0 flex-1">
          <h3 className="t-h3">
            <Link href={`/jobs/${job.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:underline decoration-2 underline-offset-4">
              {job.title}
            </Link>
          </h3>
          <p className="t-small text-ink-soft">{job.company_name}</p>
        </div>
        <div className="relative z-10 -mr-2 -mt-2"><SaveButton jobId={job.id} initialSaved={saved} /></div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {job.work_mode === "remote" && <EligibilityBadge job={job} t={t} />}
        <span className="inline-flex items-center gap-1 t-small text-ink-soft">
          {job.work_mode === "remote" ? <IconGlobe className="h-4 w-4" /> : <IconPin className="h-4 w-4" />}
          {whereLabel(job, t)}
        </span>
        {job.employment_type !== "full_time" && <span className="t-small text-ink-soft">{typeLabel(job.employment_type, t)}</span>}
      </div>

      {pay.original && (
        <p className="mt-2 t-small">
          <span className="font-semibold">{pay.original}</span>
          {pay.inr && <span className="ml-2 text-ink-faint" title={t.inrApprox}>{pay.inr}</span>}
        </p>
      )}

      {(tags.length > 0 || isAi) && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t.skills}>
          {isAi && <li className="rounded-md bg-ink px-2 py-0.5 t-tiny t-condensed font-semibold text-paper">AI</li>}
          {tags.map((s) => <li key={s} className="rounded-md border border-line px-2 py-0.5 t-tiny t-condensed text-ink-soft">{s}</li>)}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 t-tiny text-ink-faint">
        <span>{postedAgo(job.posted_at, t)}{job.sections.includes("government") && job.expires_at && (
          <b className="ml-2 rounded bg-turmeric-soft px-1.5 py-0.5 font-semibold text-turmeric-ink">
            {t.lastDate}: {new Date(job.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
          </b>
        )}</span>
        <span className="flex items-center gap-2">
          {job.risk_level === "medium" && <span className="inline-flex items-center gap-1 rounded bg-warn-soft px-1.5 py-0.5 text-warn"><IconShield className="h-3.5 w-3.5" />{t.needsVerification}</span>}
          <span>{t.source}: {job.source_name}{job.source_count > 1 ? ` +${job.source_count - 1}` : ""}</span>
          <SourceBadge source={job.source_name} />
        </span>
      </div>
    </article>
  );
}
