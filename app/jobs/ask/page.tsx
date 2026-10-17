import type { Metadata } from "next";
import { AskJobs } from "@/components/AskJobs";
import { SectionTabs } from "@/components/SectionTabs";
import { getDict } from "@/lib/i18n-server";
import { getSectionCounts } from "@/lib/jobs/data";

export const metadata: Metadata = { title: "Ask about jobs", robots: { index: false } };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { t } = await getDict();
  const [counts, { q }] = await Promise.all([getSectionCounts(), searchParams]);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-4">
      <SectionTabs current="all" t={t} counts={counts} />
      <header className="mt-6">
        <h1 className="t-display">{t.askTitle}</h1>
        <p className="mt-3 max-w-[60ch] text-ink-soft">{t.askIntro}</p>
      </header>
      <div className="mt-5"><AskJobs initial={typeof q === "string" ? q.slice(0, 400) : ""} /></div>
    </div>
  );
}
