import type { Metadata } from "next";
import { SectionPage } from "@/components/SectionPage";
import { pageMetadata, type PagePreset } from "@/lib/jobs/pages";

const preset: PagePreset = {
  path: "/jobs/search", section: "all", filters: {}, heroKey: null, subKey: null,
  title: "Search jobs", description: "Search local, remote, AI and freelance jobs.",
  groups: ["category", "skill", "type", "mode", "country", "experience", "salary", "posted"], card: "job", indiaToggle: true, careerjet: true,
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = (await searchParams).q;
  return pageMetadata({ title: q ? `“${q}” jobs` : "Search jobs", description: preset.description, path: "/jobs/search", noindex: true });
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  return <SectionPage preset={preset} params={params} heading={q ? `“${q}”` : "Search jobs"} sub={q ? "Showing jobs that match your words. Words like “remote”, “India”, “freelance” or “work from home” also set the matching filter." : "Type a skill, job title or company."} />;
}
