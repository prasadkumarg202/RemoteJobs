import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { CityPicker } from "@/components/CityPicker";
import { SearchBar } from "@/components/SearchBar";
import { SectionTabs } from "@/components/SectionTabs";
import { Shelf } from "@/components/Shelf";
import { getDict } from "@/lib/i18n-server";
import { fmt } from "@/lib/i18n";
import { getHiddenJobIds, getSectionCounts, searchJobs } from "@/lib/jobs/data";
import { pageMetadata } from "@/lib/jobs/pages";

export const metadata: Metadata = pageMetadata({
  title: "Jobs — local, remote, AI and freelance",
  description: "Find local jobs in AP & Telangana, remote jobs you can do from India, AI jobs and freelance gigs. Every remote job shows whether Indian candidates can apply.",
  path: "/jobs",
});

export default async function JobsHome() {
  const { t } = await getDict();
  const city = decodeURIComponent((await cookies()).get("mk_city")?.value ?? "") || null;
  const excludeIds = await getHiddenJobIds();
  const shelf = { limit: 6, excludeIds } as const;
  const [counts, trending, ai, remote, india, gigs, local] = await Promise.all([
    getSectionCounts(),
    searchJobs({ ...shelf, sort: "newest", india: "eligible" }),
    searchJobs({ ...shelf, sections: ["ai"], sort: "newest" }),
    searchJobs({ ...shelf, sections: ["remote"], sort: "newest" }),
    searchJobs({ ...shelf, sections: ["remote"], india: "india_only", sort: "newest" }),
    searchJobs({ ...shelf, sections: ["freelance"], sort: "newest" }),
    searchJobs({ ...shelf, sections: ["local"], city: city ?? undefined, sort: "newest" }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <section aria-labelledby="hero" className="max-w-3xl">
        <h1 id="hero" className="t-display">{t.findNextJob}</h1>
        <p className="mt-3 max-w-[56ch] text-ink-soft">
          <Link href="/jobs/remote/india" className="underline decoration-leaf decoration-2 underline-offset-4 hover:text-ink">
            {fmt(t.heroStats, { total: (counts.all ?? 0).toLocaleString("en-IN"), india: (counts.india ?? 0).toLocaleString("en-IN") })}
          </Link>
        </p>
        <div className="mt-5"><SearchBar showExamples /></div>
      </section>

      <div className="mt-6"><SectionTabs current="all" t={t} counts={counts} /></div>

      <Shelf title={`🔥 ${t.trending}`} href="/jobs/search?sort=newest" jobs={trending.items} t={t} />
      <Shelf title={`🤖 ${t.latestAi}`} href="/jobs/ai" jobs={ai.items} t={t} />
      <Shelf title={`🌎 ${t.remoteJobs}`} href="/jobs/remote" jobs={remote.items} t={t} />
      <Shelf title={`🇮🇳 ${t.remoteJobsIndia}`} href="/jobs/remote/india" jobs={india.items} t={t} />
      <Shelf title={`⚡ ${t.freelanceGigs}`} href="/jobs/freelance" jobs={gigs.items} t={t} card="gig" />

      <Shelf title={`📍 ${t.jobsNearYou}`} href={city ? `/jobs/local?city=${encodeURIComponent(city)}` : "/jobs/local"} jobs={local.items} t={t} empty={t.localEmpty} extra={<CityPicker city={city} />} />

      <aside className="mt-12 rounded-3xl bg-ink p-6 text-paper md:flex md:items-center md:justify-between md:p-8">
        <div className="max-w-[46ch]">
          <h2 className="t-h2">{t.postJob}</h2>
          <p className="mt-2 text-paper/80">{t.postIntro}</p>
        </div>
        <Link href="/jobs/post" className="mt-4 inline-flex min-h-12 items-center rounded-full bg-turmeric px-6 font-semibold text-ink md:mt-0">{t.postJob}</Link>
      </aside>
    </div>
  );
}
