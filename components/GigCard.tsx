import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import { payLabel, postedAgo, typeLabel } from "@/lib/jobs/format";
import type { JobCard as Job } from "@/lib/jobs/types";
import { EligibilityBadge, railClass } from "./EligibilityBadge";
import { IconClock, IconRupee } from "./icons";
import { SaveButton } from "./SaveButton";
import { SourceBadge } from "./SourceBadge";

/** Card tuned for short-term work: budget and duration first, company second. */
export function GigCard({ job, t, saved = false }: { job: Job; t: Dict; saved?: boolean }) {
  const pay = payLabel(job);
  const dur = job.job_duration !== "unknown" ? (t[job.job_duration as keyof Dict] as string) : null;
  return (
    <article className={`relative flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4 pl-5 ${railClass(job, t)}`}>
      <div className="flex items-start gap-2">
        <h3 className="t-h3 flex-1">
          <Link href={`/jobs/${job.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:underline decoration-2 underline-offset-4">{job.title}</Link>
        </h3>
        <div className="relative z-10 -mr-2 -mt-2"><SaveButton jobId={job.id} initialSaved={saved} /></div>
      </div>
      <dl className="mt-3 grid gap-1.5 t-small">
        <div className="flex items-center gap-2">
          <dt className="sr-only">{t.budget}</dt>
          <IconRupee className="h-4 w-4 text-ink-faint" />
          <dd className="font-semibold">{pay.original ?? "—"}{pay.inr && <span className="ml-2 font-normal text-ink-faint">{pay.inr}</span>}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="sr-only">{t.duration}</dt>
          <IconClock className="h-4 w-4 text-ink-faint" />
          <dd>{dur ?? typeLabel(job.employment_type, t)}</dd>
        </div>
      </dl>
      <div className="mt-3"><EligibilityBadge job={job} t={t} /></div>
      <div className="mt-auto flex flex-wrap justify-between gap-x-3 gap-y-1 pt-3 t-tiny text-ink-faint">
        <span>{job.company_name}</span>
        <span>{postedAgo(job.posted_at, t)}</span>
        <span className="flex w-full items-center gap-2">{t.source}: {job.source_name} <SourceBadge source={job.source_name} /></span>
      </div>
    </article>
  );
}
