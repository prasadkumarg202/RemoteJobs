import type { Metadata } from "next";
import { SectionPage, resolveFilters } from "@/components/SectionPage";
import { MIN_JOBS_TO_INDEX, PRESETS, pageMetadata } from "./pages";
import { searchJobs } from "./data";

type Params = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<Params> };

/** Metadata for a section page: canonical to the clean URL; filtered/search variants and thin pages are noindex. */
export function sectionMetadata(key: keyof typeof PRESETS) {
  return async ({ searchParams }: Props): Promise<Metadata> => {
    const preset = PRESETS[key];
    const params = await searchParams;
    const filtered = Object.keys(params).length > 0;
    const { total } = await searchJobs({ ...resolveFilters(preset, {}), limit: 1 });
    return pageMetadata({ title: preset.title, description: preset.description, path: preset.path, noindex: filtered || total < MIN_JOBS_TO_INDEX });
  };
}

export function sectionPage(key: keyof typeof PRESETS, extras?: { top?: (params: Params) => Promise<React.ReactNode> | React.ReactNode }) {
  return async function Page({ searchParams }: Props) {
    const params = await searchParams;
    return <SectionPage preset={PRESETS[key]} params={params} top={extras?.top ? await extras.top(params) : undefined} />;
  };
}
