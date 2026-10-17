import type { Dict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n";
import { careerjetSiteUrl } from "@/lib/jobs/careerjet-core";
import { careerjetEnabled, searchCareerjet } from "@/lib/jobs/careerjet";
import { IconExternal } from "./icons";

/**
 * "More jobs from Careerjet" under the search results. With CAREERJET_API_KEY it lists a few live results
 * (Careerjet pays per click on them); always offers a button that opens Careerjet's own search.
 * Results are Careerjet's, not ours: clearly labelled, open in a new tab, never saved.
 */
export async function CareerjetBox({ q, place, t }: { q: string; place: string; t: Dict }) {
  if (!careerjetEnabled()) return null;
  const live = await searchCareerjet(q, place);
  const siteUrl = careerjetSiteUrl(q, place);
  return (
    <section aria-labelledby="careerjet" className="mt-8 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="careerjet" className="t-h3">{t.careerjetTitle}</h2>
        <span className="t-tiny text-ink-faint">{t.careerjetBy}</span>
      </div>
      <p className="mt-1 t-small text-ink-soft">{t.careerjetSub}</p>
      {live && live.jobs.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {live.jobs.map((j) => (
            <li key={j.url}>
              <a href={j.url} target="_blank" rel="nofollow sponsored noopener" className="block rounded-xl border border-line bg-paper p-3 hover:border-ink">
                <span className="flex items-start justify-between gap-2 font-semibold">{j.title} <IconExternal className="mt-1 h-4 w-4 shrink-0 text-ink-faint" /></span>
                <span className="mt-0.5 block t-small text-ink-soft">{[j.company, j.locations, j.salary, j.date].filter(Boolean).join(" · ")}</span>
                {j.description && <span className="mt-1 block t-small text-ink-faint">{j.description}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
      <a href={siteUrl} target="_blank" rel="nofollow noopener"
        className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-4 t-small font-medium hover:border-ink">
        {q.trim() ? fmt(t.careerjetOpen, { q: q.trim().slice(0, 60), place }) : fmt(t.careerjetOpenAll, { place })} <IconExternal className="h-4 w-4" />
      </a>
      <p className="mt-2 t-tiny text-ink-faint">{live?.jobs.length ? t.careerjetNote : t.careerjetNoteLink}</p>
    </section>
  );
}
