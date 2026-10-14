import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import type { JobCard as Job } from "@/lib/jobs/types";
import { GigCard } from "./GigCard";
import { JobCard } from "./JobCard";

/** A titled row of jobs: horizontal scroll on phones, grid on desktop. */
export function Shelf({ title, href, jobs, t, card = "job", empty, extra }: { title: string; href: string; jobs: Job[]; t: Dict; card?: "job" | "gig"; empty?: string; extra?: React.ReactNode }) {
  if (!jobs.length && !empty) return null;
  return (
    <section className={title ? "mt-10" : ""} aria-label={title || undefined}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {title ? <h2 className="t-h2">{title}</h2> : <span />}
        {extra}
        <Link href={href} className="ml-auto shrink-0 t-small font-medium text-ink underline decoration-turmeric decoration-2 underline-offset-4">{t.seeAll}</Link>
      </div>
      {jobs.length ? (
        <ul className="scroll-x -mx-4 flex snap-x gap-3 px-4 md:mx-0 md:grid md:grid-cols-2 md:px-0 lg:grid-cols-3">
          {jobs.map((j) => (
            <li key={j.id} className="w-[86%] max-w-sm shrink-0 snap-start md:w-auto md:max-w-none">
              {card === "gig" ? <GigCard job={j} t={t} /> : <JobCard job={j} t={t} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface p-5 text-ink-soft">{empty}</p>
      )}
    </section>
  );
}
