import { AffiliateSlot } from "@/components/AffiliateSlot";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countryName, regionName } from "@engine/geo.ts";
import { CompanyLogo } from "@/components/CompanyLogo";
import { EligibilityBadge } from "@/components/EligibilityBadge";
import { IconExternal, IconShield } from "@/components/icons";
import { JobActions } from "@/components/JobActions";
import { SectionPage, resolveFilters } from "@/components/SectionPage";
import { Shelf } from "@/components/Shelf";
import { SourceBadge } from "@/components/SourceBadge";
import { TeluguSummary } from "@/components/TeluguSummary";
import { Track } from "@/components/Track";
import { SITE_URL } from "@/lib/env";
import { fmt, type Dict } from "@/lib/i18n";
import { getDict } from "@/lib/i18n-server";
import { getJobBySlug, getSavedJobIds, searchJobs } from "@/lib/jobs/data";
import { experienceLabel, payLabel, postedAgo, typeLabel, whereLabel } from "@/lib/jobs/format";
import { MIN_JOBS_TO_INDEX, TOPICS, pageMetadata, type PagePreset } from "@/lib/jobs/pages";
import { sanitizeJobHtml } from "@/lib/jobs/sanitize";
import type { JobDetail } from "@/lib/jobs/types";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

function topicPreset(slug: string): PagePreset | null {
  const topic = TOPICS[slug];
  if (!topic) return null;
  return {
    path: `/jobs/${slug}`, section: "all", filters: topic.filters, heroKey: null, subKey: null,
    heading: `${topic.name} jobs`, title: `${topic.name} jobs — remote, India & freelance`, description: `${topic.blurb} Remote, India and freelance listings with eligibility checked.`,
    groups: ["type", "mode", "country", "experience", "salary", "posted"], card: "job", indiaToggle: true,
  };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const topic = topicPreset(slug);
  if (topic) {
    const { total } = await searchJobs({ ...resolveFilters(topic, {}), limit: 1 });
    return pageMetadata({ title: topic.title, description: topic.description, path: topic.path, noindex: Object.keys(await searchParams).length > 0 || total < MIN_JOBS_TO_INDEX });
  }
  const job = await getJobBySlug(slug);
  if (!job) return { title: "Job not found", robots: { index: false } };
  const where = job.work_mode === "remote" ? "Remote" : job.city ?? "";
  const meta = pageMetadata({
    title: `${job.title} at ${job.company_name}${where ? ` (${where})` : ""}`,
    description: job.short_description.slice(0, 155),
    path: `/jobs/${job.slug}`,
    // Aggregated listings are thin copies of the source page: keep them out of the index, follow links.
    noindex: !isOwnListing(job),
  });
  return meta;
}

function isOwnListing(job: JobDetail) {
  return job.sources.length > 0 && job.sources.every((s) => s.allow_structured_data);
}

/** JobPosting JSON-LD only for jobs Mana Kosamu itself publishes (never for aggregated sources such as Himalayas). */
function jobPostingJsonLd(job: JobDetail) {
  if (!isOwnListing(job) || job.moderation_status !== "approved") return null;
  const salary = job.salary_min || job.salary_max ? {
    "@type": "MonetaryAmount", currency: job.salary_currency,
    value: { "@type": "QuantitativeValue", minValue: job.salary_min, maxValue: job.salary_max, unitText: ({ hourly: "HOUR", daily: "DAY", weekly: "WEEK", monthly: "MONTH", yearly: "YEAR" } as Record<string, string>)[job.salary_period ?? ""] ?? undefined },
  } : undefined;
  return {
    "@context": "https://schema.org", "@type": "JobPosting", title: job.title, description: job.description.replace(/\n/g, "<br>"),
    datePosted: job.posted_at, validThrough: job.expires_at ?? undefined,
    employmentType: ({ full_time: "FULL_TIME", part_time: "PART_TIME", contract: "CONTRACTOR", freelance: "CONTRACTOR", gig: "CONTRACTOR", temporary: "TEMPORARY", internship: "INTERN" } as Record<string, string>)[job.employment_type],
    hiringOrganization: { "@type": "Organization", name: job.company_name },
    jobLocationType: job.work_mode === "remote" ? "TELECOMMUTE" : undefined,
    jobLocation: job.work_mode !== "remote" ? { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.city, addressRegion: job.state, addressCountry: "IN" } } : undefined,
    applicantLocationRequirements: job.work_mode === "remote" && job.eligible_countries.length ? job.eligible_countries.map((c) => ({ "@type": "Country", name: countryName(c) })) : undefined,
    baseSalary: salary,
    directApply: false,
  };
}

function WhoCanApply({ job, t }: { job: JobDetail; t: Dict }) {
  const rows: Array<[string, string]> = [];
  if (job.work_mode === "remote") {
    if (job.eligibility_type === "worldwide") rows.push([t.worldwide, t.openAnywhere]);
    if (job.eligible_countries.length) rows.push([t.country, job.eligible_countries.map(countryName).join(", ")]);
    if (job.eligible_regions.length) rows.push([t.region, job.eligible_regions.map(regionName).join(", ")]);
    if (job.timezone_requirements.length) rows.push([t.timezone, job.timezone_requirements.join(", ")]);
    if (job.eligibility_type === "unknown") rows.push([t.eligibilityUnknown, t.eligibilityUnknownHelp]);
  } else {
    rows.push([t.workMode, whereLabel(job, t)]);
  }
  return (
    <dl className="grid gap-2">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[110px_1fr] gap-3 t-small"><dt className="text-ink-faint">{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

export default async function JobPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const topic = topicPreset(slug);
  if (topic) return <SectionPage preset={topic} params={await searchParams} />;

  const job = await getJobBySlug(slug);
  if (!job) notFound();
  const { t, lang } = await getDict();
  const saved = (await getSavedJobIds()).includes(job.id);
  const pay = payLabel(job);
  const exp = experienceLabel(job, t);
  const url = `${SITE_URL}/jobs/${job.slug}`;
  const primary = job.sources.find((s) => s.is_primary) ?? job.sources[0];
  const isOwn = isOwnListing(job);
  const ld = jobPostingJsonLd(job);
  const similar = await searchJobs({ categories: job.subcategory ? [job.subcategory] : undefined, sections: job.work_mode === "remote" ? ["remote"] : undefined, excludeIds: [job.id], limit: 6, sort: "newest" });
  const html = job.description_html ? sanitizeJobHtml(job.description_html) : null;
  const applyLabel = job.application_method === "email" ? t.applyEmail : job.application_method === "whatsapp" ? t.applyWhatsapp : t.applyOriginal;
  const active = job.is_active && (!job.expires_at || new Date(job.expires_at) > new Date());
  const section = job.sections.includes("ai") ? { href: "/jobs/ai", label: t.aiJobsLong } : job.sections.includes("freelance") ? { href: "/jobs/freelance", label: t.freelance } : job.work_mode === "remote" ? { href: "/jobs/remote", label: t.remoteJobs } : { href: "/jobs/local", label: t.localJobs };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <Track event="job_view" jobId={job.id} />
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />}
      <nav aria-label="Breadcrumb" className="t-small text-ink-faint">
        <Link href="/jobs" className="hover:text-ink">{t.jobs}</Link> <span aria-hidden>/</span> <Link href={section.href} className="hover:text-ink">{section.label}</Link>
      </nav>

      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <article>
          <header className="flex gap-4">
            <CompanyLogo src={job.company_logo} name={job.company_name} size={64} />
            <div className="min-w-0">
              <h1 className="t-h1">{job.title}</h1>
              <p className="mt-1 text-lg text-ink-soft">{job.company_name}</p>
            </div>
          </header>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {job.work_mode === "remote" && <EligibilityBadge job={job} t={t} />}
            <span className="rounded-full border border-line px-3 py-1 t-small">{whereLabel(job, t)}</span>
            <span className="rounded-full border border-line px-3 py-1 t-small">{typeLabel(job.employment_type, t)}</span>
            {exp && <span className="rounded-full border border-line px-3 py-1 t-small">{exp}</span>}
            {job.job_duration !== "unknown" && job.employment_type !== "full_time" && <span className="rounded-full border border-line px-3 py-1 t-small">{t[job.job_duration as keyof Dict]}</span>}
          </div>

          {pay.original && (
            <div className="mt-4">
              <p className="text-xl font-semibold" style={{ fontStretch: "108%" }}>{pay.original}</p>
              {pay.inr && <p className="t-small text-ink-soft">{pay.inr} <span className="text-ink-faint">— {t.inrApprox}</span></p>}
            </div>
          )}

          <p className="mt-3 t-small text-ink-faint">
            {postedAgo(job.posted_at, t)}
            {job.expires_at && <> {"· "}{fmt(t.expires, { date: new Date(job.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) })}</>}
          </p>

          {(job.risk_level !== "low") && (
            <div role="note" className="mt-4 flex gap-3 rounded-2xl bg-warn-soft p-4 text-warn">
              <IconShield className="mt-0.5 h-5 w-5 shrink-0" />
              <div><p className="font-semibold">{t.needsVerification}</p><p className="t-small">{t.needsVerificationHelp}</p></div>
            </div>
          )}

          {!active && <p className="mt-4 rounded-2xl bg-closed-soft p-4 font-medium">{t.jobClosed}</p>}

          <div className="mt-6 hidden lg:block">
            {active && <ApplyButton job={job} label={applyLabel} />}
          </div>

          <div className="mt-6"><JobActions jobId={job.id} title={job.title} company={job.company_name} url={url} initialSaved={saved} /></div>

          {job.skills.length > 0 && (
            <section className="mt-8">
              <h2 className="t-h3">{t.skills}</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">{job.skills.map((s) => <li key={s} className="rounded-md border border-line px-2.5 py-1 t-small t-condensed">{s}</li>)}</ul>
            </section>
          )}

          <section className="mt-8">
            <h2 className="t-h3">{t.whoCanApply}</h2>
            <div className="mt-3"><WhoCanApply job={job} t={t} /></div>
          </section>

          <div className="mt-8"><TeluguSummary jobId={job.id} /></div>

          <section className="mt-8">
            <h2 className="t-h3">{t.aboutJob}</h2>
            {html ? <div className="prose-job mt-3" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="prose-job mt-3 whitespace-pre-line">{job.description}</div>}
          </section>
        </article>

        <aside className="mt-8 lg:mt-0">
          <div className="rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-4">
            <p className="t-small font-semibold">{t.source}: {isOwn ? "Mana Kosamu Employer" : primary?.name ?? job.source_name}</p>
            <p className="mt-2 t-small text-ink-soft">{isOwn ? t.employerListing : fmt(t.originalListing, { source: primary?.name ?? job.source_name })}</p>
            {!isOwn && (
              <ul className="mt-3 grid gap-2">
                {job.sources.map((s) => (
                  <li key={s.slug + s.external_url}>
                    <a href={s.external_url} target="_blank" rel="noopener nofollow" className="inline-flex min-h-11 items-center gap-2 t-small font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                      {fmt(t.viewOn, { source: s.name })} <IconExternal className="h-4 w-4" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {job.sources.some((s) => s.name === "Adzuna") && <div className="mt-3"><SourceBadge source="Adzuna" /></div>}
            {job.sources.length > 1 && <p className="mt-3 rounded-lg bg-paper px-3 py-2 t-tiny text-ink-soft">{t.foundOnMultiple}</p>}
          </div>
          <div className="mt-4"><AffiliateSlot placement="job" t={t} lang={lang} compact /></div>
        </aside>
      </div>

      {similar.items.length > 0 && <Shelf title={t.similarJobs} href={section.href} jobs={similar.items} t={t} />}

      {active && (
        <div className="fixed inset-x-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur lg:hidden" style={{ bottom: "calc(64px + env(safe-area-inset-bottom))" }}>
          <ApplyButton job={job} label={applyLabel} />
        </div>
      )}
      <div className="h-20 lg:hidden" aria-hidden />
    </div>
  );
}

function ApplyButton({ job, label }: { job: JobDetail; label: string }) {
  return (
    <a href={`/go/${job.id}`} target="_blank" rel="noopener nofollow"
      className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 text-lg font-semibold text-paper lg:w-auto lg:inline-flex">
      {label} <IconExternal className="h-5 w-5" />
    </a>
  );
}
