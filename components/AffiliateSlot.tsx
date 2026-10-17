import type { Dict, Lang } from "@/lib/i18n";
import { partnersFor, type Placement } from "@/lib/affiliates/catalog";
import { getAffiliateLinks } from "@/lib/affiliates/data";
import { IconExternal } from "./icons";

const TITLE: Record<Placement, keyof Dict> = {
  remote: "toolsRemote", ai: "toolsAi", freelance: "toolsFreelance", wfh: "toolsWfh", job: "toolsJob", post: "toolsPost",
};

/**
 * "Recommended tools" block with affiliate partners. Renders nothing until the admin has
 * added at least one tracking link for this placement. Always labelled as sponsored (ASCI rules).
 */
export async function AffiliateSlot({ placement, t, lang, compact = false }: { placement: Placement; t: Dict; lang: Lang; compact?: boolean }) {
  const partners = partnersFor(placement, await getAffiliateLinks());
  if (!partners.length) return null;
  return (
    <section aria-labelledby={`aff-${placement}`} className={`rounded-2xl border border-line bg-surface ${compact ? "p-4" : "mt-8 p-5"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`aff-${placement}`} className="t-h3">{t[TITLE[placement]] as string}</h2>
        <span className="rounded-full bg-turmeric-soft px-2 py-0.5 t-tiny font-medium text-turmeric-ink">{t.sponsored}</span>
      </div>
      <ul className={`mt-3 grid gap-3 ${compact ? "" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {partners.map((p) => (
          <li key={p.slug} className="flex flex-col rounded-xl border border-line bg-paper p-4">
            <p className="font-semibold">{p.name}</p>
            <p className="mt-1 flex-1 t-small text-ink-soft">{p.blurb[lang]}</p>
            <a href={`/out/${p.slug}?from=${placement}`} target="_blank" rel="sponsored nofollow noopener"
              className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full border border-line-strong px-4 t-small font-medium hover:border-ink">
              {p.cta[lang]} <IconExternal className="h-4 w-4" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 t-tiny text-ink-faint">{t.affiliateDisclosure}</p>
    </section>
  );
}
