import Link from "next/link";
import { CATEGORIES, FREELANCE_PAGE_CATEGORIES } from "@engine/taxonomy.ts";
import { SectionPage } from "@/components/SectionPage";
import { getDict } from "@/lib/i18n-server";
import { PRESETS } from "@/lib/jobs/pages";
import { sectionMetadata } from "@/lib/jobs/route";

export const generateMetadata = sectionMetadata("freelance");
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function FreelancePage({ searchParams }: Props) {
  const params = await searchParams;
  const { lang } = await getDict();
  const selected = typeof params.cat === "string" ? params.cat.split(",") : [];
  const top = (
    <nav aria-label="Categories" className="scroll-x -mx-4 mt-5 px-4">
      <ul className="flex gap-2 md:flex-wrap">
        {FREELANCE_PAGE_CATEGORIES.map((slug) => {
          const c = CATEGORIES.find((x) => x.slug === slug)!;
          const on = selected.includes(slug);
          return (
            <li key={slug} className="shrink-0">
              <Link href={on ? "/jobs/freelance" : `/jobs/freelance?cat=${slug}`} aria-current={on ? "true" : undefined}
                className={`inline-flex min-h-10 items-center rounded-lg border px-3 t-small t-condensed ${on ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink-soft hover:text-ink"}`}>
                {lang === "te" ? c.name_te : c.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
  return <SectionPage preset={PRESETS.freelance} params={params} top={top} />;
}
