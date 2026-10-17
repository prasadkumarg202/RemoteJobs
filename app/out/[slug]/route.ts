import { NextResponse } from "next/server";
import { asPlacement, getPartner, isValidAffiliateUrl } from "@/lib/affiliates/catalog";
import { getAffiliateLinks } from "@/lib/affiliates/data";
import { recordEvent } from "@/lib/jobs/events";

// Affiliate redirect: logs affiliate_click, then sends the user to the partner's tracking link.
// Only partners in the catalog with an admin-approved https link are reachable (no open redirect).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const partner = getPartner(slug);
  const link = partner ? (await getAffiliateLinks())[partner.slug] : undefined;
  if (!partner || !link?.enabled || !isValidAffiliateUrl(link.url)) {
    return NextResponse.redirect(new URL("/jobs", req.url), 302);
  }
  const from = asPlacement(new URL(req.url).searchParams.get("from"));
  await recordEvent({ event: "affiliate_click", section: from, filters: { partner: partner.slug } }).catch(() => undefined);
  const res = NextResponse.redirect(link.url!.trim(), 302);
  res.headers.set("Referrer-Policy", "origin");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
