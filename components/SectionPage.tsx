import { Suspense } from "react";
import { getDict } from "@/lib/i18n-server";
import { fmt } from "@/lib/i18n";
import { getHiddenJobIds, getSavedJobIds, getSectionCounts, PAGE_SIZE, searchJobs } from "@/lib/jobs/data";
import { applyIntent, filtersFromParams, parseQueryIntent } from "@/lib/jobs/filters";
import type { PagePreset } from "@/lib/jobs/pages";
import type { JobFilters } from "@/lib/jobs/types";
import { FilterPanel, SortSelect } from "./FilterPanel";
import { GigCard } from "./GigCard";
import { IndiaToggle } from "./IndiaToggle";
import { JobCard } from "./JobCard";
import { Pagination } from "./Pagination";
import { SearchBar } from "./SearchBar";
import { SectionTabs } from "./SectionTabs";
import { Track } from "./Track";

type Params = Record<string, string | string[] | undefined>;

export function resolveFilters(preset: Pick<PagePreset, "filters" | "defaultIndia">, params: Params): JobFilters {
  const url = filtersFromParams(params);
  const intent = parseQueryIntent(url.q);
  const merged = applyIntent(url, intent);
  return {
    ...merged,
    sections: [...new Set([...(preset.filters.sections ?? []), ...(merged.sections ?? [])])],
    india: url.india ?? merged.india ?? preset.defaultIndia,
    categories: url.categories?.length ? url.categories : preset.filters.categories,
    aiCategories: url.aiCategories?.length ? url.aiCategories : preset.filters.aiCategories,
    seniority: url.seniority?.length ? url.seniority : preset.filters.seniority,
  };
}

export async function SectionPage({ preset, params, top, heading, sub }: { preset: PagePreset; params: Params; top?: React.ReactNode; heading?: string; sub?: string }) {
  const { t } = await getDict();
  const [hidden, saved, counts] = await Promise.all([getHiddenJobIds(), getSavedJobIds(), getSectionCounts()]);
  const filters = { ...resolveFilters(preset, params), excludeIds: hidden };
  const res = await searchJobs(filters);
  const savedSet = new Set(saved);
  const page = filters.page ?? 1;
  const q = typeof params.q === "string" ? params.q : "";
  const title = heading ?? preset.heading ?? (preset.heroKey ? t[preset.heroKey] : preset.title);
  const subtitle = sub ?? (preset.subKey ? t[preset.subKey] : preset.description);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <SectionTabs current={preset.section} t={t} counts={counts} />
      <header className="mt-6 max-w-3xl">
        <h1 className="t-display">{title}</h1>
        <p className="mt-3 max-w-[60ch] text-ink-soft">{subtitle}</p>
      </header>
      {top}
      <div className="mt-5 grid gap-3">
        <SearchBar size="md" action={preset.path} defaultValue={q} />
        {preset.indiaToggle && <Suspense><IndiaToggle defaultMode={preset.defaultIndia ?? "any"} /></Suspense>}
      </div>
      {q && <Track event="search" query={q} section={preset.section} />}

      <div className="mt-5 md:grid md:grid-cols-[280px_minmax(0,1fr)] md:gap-6">
        <Suspense><FilterPanel groups={preset.groups} total={res.total} /></Suspense>
        <section aria-label={fmt(t.results, { n: res.total })} className="mt-3 md:mt-0">
          <div className="mb-3 hidden items-center justify-between md:flex">
            <p className="t-small text-ink-soft">{fmt(t.results, { n: res.total.toLocaleString("en-IN") })}</p>
            <Suspense><SortSelect /></Suspense>
          </div>
          {res.items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-ink-soft">{preset.emptyKey && !q ? t[preset.emptyKey] : t.noResults}</p>
          ) : (
            <ul className={`grid gap-3 ${preset.card === "gig" ? "lg:grid-cols-2" : ""}`}>
              {res.items.map((job) => (
                <li key={job.id} className="flex">
                  <div className="w-full">{preset.card === "gig" ? <GigCard job={job} t={t} saved={savedSet.has(job.id)} /> : <JobCard job={job} t={t} saved={savedSet.has(job.id)} />}</div>
                </li>
              ))}
            </ul>
          )}
          <Pagination path={preset.path} params={params} page={page} total={res.total} pageSize={PAGE_SIZE} labels={{ previous: t.previous, next: t.next }} />
        </section>
      </div>
    </div>
  );
}
