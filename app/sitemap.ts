import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";
import { searchJobs } from "@/lib/jobs/data";
import { MIN_JOBS_TO_INDEX, PRESETS, TOPICS } from "@/lib/jobs/pages";
import { resolveFilters } from "@/components/SectionPage";

export const revalidate = 3600;

// Landing pages with enough live jobs. Aggregated job pages are noindex, so they're not listed;
// only jobs published directly on Mana Kosamu would be (served via their own pages).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [{ url: `${SITE_URL}/jobs`, changeFrequency: "hourly", priority: 1 }];
  for (const p of Object.values(PRESETS)) {
    const { total } = await searchJobs({ ...resolveFilters(p, {}), limit: 1 });
    if (total >= MIN_JOBS_TO_INDEX) entries.push({ url: `${SITE_URL}${p.path}`, changeFrequency: "hourly", priority: 0.8 });
  }
  for (const [slug, topic] of Object.entries(TOPICS)) {
    const { total } = await searchJobs({ ...topic.filters, limit: 1 });
    if (total >= MIN_JOBS_TO_INDEX) entries.push({ url: `${SITE_URL}/jobs/${slug}`, changeFrequency: "daily", priority: 0.6 });
  }
  const own = await searchJobs({ sources: ["employer", "manual"], limit: 100, sort: "newest" });
  for (const j of own.items) entries.push({ url: `${SITE_URL}/jobs/${j.slug}`, lastModified: j.posted_at, changeFrequency: "weekly", priority: 0.5 });
  return entries;
}
