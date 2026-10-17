import "server-only";
import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { asPlacement, envLinks, mergeLinks, type AffiliateLink, type Placement } from "./catalog";

type Row = { slug: string; url: string | null; enabled: boolean; placements: string[] | null };

const toLink = (r: Row): AffiliateLink => ({
  url: r.url,
  enabled: r.enabled,
  placements: r.placements?.map(asPlacement).filter((p): p is Placement => p !== null) ?? null,
});

/** Live affiliate links (public RLS only returns enabled rows that have a link). Cached per request. */
export const getAffiliateLinks = cache(async (): Promise<Record<string, AffiliateLink>> => {
  const db: Record<string, AffiliateLink> = {};
  const sb = await supabaseServer();
  if (sb) {
    const { data } = await sb.from("affiliate_partners").select("slug,url,enabled,placements");
    for (const r of (data ?? []) as Row[]) db[r.slug] = toLink(r);
  }
  return mergeLinks(db, envLinks(process.env));
});

/** Admin view: every row, including disabled ones (RLS allows admins only). */
export async function getAllAffiliateRows(): Promise<Record<string, Row & { note: string | null; updated_at: string }>> {
  const sb = await supabaseServer();
  if (!sb) return {};
  const { data } = await sb.from("affiliate_partners").select("slug,url,enabled,placements,note,updated_at");
  return Object.fromEntries(((data ?? []) as Array<Row & { note: string | null; updated_at: string }>).map((r) => [r.slug, r]));
}
