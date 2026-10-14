import Link from "next/link";
import { CATEGORIES, AI_PAGE_SUBCATEGORIES } from "@engine/taxonomy.ts";
import { SectionPage } from "@/components/SectionPage";
import { Shelf } from "@/components/Shelf";
import { getDict } from "@/lib/i18n-server";
import { searchJobs } from "@/lib/jobs/data";
import { PRESETS } from "@/lib/jobs/pages";
import { sectionMetadata } from "@/lib/jobs/route";

export const generateMetadata = sectionMetadata("ai");
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AiJobsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { t, lang } = await getDict();
  const selected = typeof params.ai === "string" ? params.ai.split(",") : [];
  const browsing = Object.keys(params).length === 0;
  const shelves = browsing
    ? await Promise.all([
        searchJobs({ sections: ["ai", "remote"], limit: 6, sort: "newest" }),
        searchJobs({ sections: ["ai"], india: "eligible", limit: 6, sort: "newest" }),
        searchJobs({ sections: ["ai"], seniority: ["entry"], limit: 6, sort: "newest" }),
        searchJobs({ sections: ["ai", "freelance"], limit: 6, sort: "newest" }),
      ])
    : null;

  const top = (
    <>
      <nav aria-label={t.aiCategory} className="scroll-x -mx-4 mt-5 px-4">
        <ul className="flex gap-2">
          {AI_PAGE_SUBCATEGORIES.map((slug) => {
            const c = CATEGORIES.find((x) => x.slug === slug)!;
            const on = selected.includes(slug);
            return (
              <li key={slug} className="shrink-0">
                <Link href={on ? "/jobs/ai" : `/jobs/ai?ai=${slug}`} aria-current={on ? "true" : undefined}
                  className={`inline-flex min-h-10 items-center rounded-lg border px-3 t-small t-condensed ${on ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink-soft hover:text-ink"}`}>
                  {lang === "te" ? c.name_te : c.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {shelves && (
        <div>
          <Shelf title={t.remoteAiJobs} href="/jobs/ai/remote" jobs={shelves[0].items} t={t} />
          <Shelf title={`🇮🇳 ${t.indiaAiJobs}`} href="/jobs/ai/india" jobs={shelves[1].items} t={t} />
          <Shelf title={t.entryLevelAi} href="/jobs/ai?level=entry" jobs={shelves[2].items} t={t} />
          <Shelf title={t.freelanceAiGigs} href="/jobs/freelance?ai=generative-ai,llm,ai-automation,prompt-engineering,ai-agents,rag" jobs={shelves[3].items} t={t} card="gig" />
          <h2 className="t-h2 mt-10">{t.latestAi}</h2>
        </div>
      )}
    </>
  );
  return <SectionPage preset={PRESETS.ai} params={params} top={top} />;
}
