// Affiliate partners shown in "Recommended tools" slots. Pure data + helpers (no server imports),
// so it is shared by pages, the /out redirect, the admin screen and tests.
//
// The tracking link for each partner is NOT stored here: the admin pastes it in /admin/jobs/affiliates
// (table public.affiliate_partners) or sets AFFILIATE_URL_<SLUG> in the environment.
// A partner is shown only when it has a valid https link and is switched on.

export type Placement = "remote" | "ai" | "freelance" | "wfh" | "job" | "post";
export const PLACEMENTS: Placement[] = ["remote", "ai", "freelance", "wfh", "job", "post"];

export interface AffiliatePartner {
  slug: string;
  name: string;
  /** Short label on the button. */
  cta: { en: string; te: string };
  blurb: { en: string; te: string };
  placements: Placement[];
  /** For the admin screen and docs only. */
  program: { signup: string; network: string; pays: string };
}

export const AFFILIATE_CATALOG: AffiliatePartner[] = [
  {
    slug: "fiverr", name: "Fiverr",
    cta: { en: "Hire on Fiverr", te: "Fiverrలో హైర్ చేయండి" },
    blurb: { en: "Need a logo, video or website quickly? Hire a freelancer for a fixed price.", te: "లోగో, వీడియో లేదా వెబ్‌సైట్ త్వరగా కావాలా? ఫిక్స్‌డ్ ధరకు ఫ్రీలాన్సర్‌ను పెట్టుకోండి." },
    placements: ["post", "freelance"],
    program: { signup: "https://www.fiverr.com/partnerships/affiliates", network: "Fiverr Affiliates (direct)", pays: "25% of a new buyer's first order + 10% revenue share for 12 months (Logo Maker: $30 + 10%). Pays on BUYERS, not sellers." },
  },
  {
    slug: "upwork", name: "Upwork",
    cta: { en: "Hire on Upwork", te: "Upworkలో హైర్ చేయండి" },
    blurb: { en: "Post a project and hire vetted freelancers for longer work.", te: "ప్రాజెక్ట్ పోస్ట్ చేసి, ఎక్కువ కాలం పనికి నమ్మకమైన ఫ్రీలాన్సర్లను పెట్టుకోండి." },
    placements: ["post", "freelance"],
    program: { signup: "https://www.upwork.com/affiliates", network: "Impact", pays: "70% of a new client's first contract spend, capped at $150. No trademark bidding. International affiliates accepted." },
  },
  {
    slug: "freelancer", name: "Freelancer.com",
    cta: { en: "Post a project", te: "ప్రాజెక్ట్ పోస్ట్ చేయండి" },
    blurb: { en: "Get quotes from freelancers worldwide for small projects.", te: "చిన్న ప్రాజెక్టులకు ప్రపంచవ్యాప్త ఫ్రీలాన్సర్ల నుండి కోట్స్ పొందండి." },
    placements: ["post"],
    program: { signup: "https://www.freelancer.com/users/settings/referrals", network: "Freelancer.com referral programme (in your account)", pays: "Referral credit/commission per Freelancer.com's current referral terms — check in your account before enabling." },
  },
  {
    slug: "coursera", name: "Coursera",
    cta: { en: "Explore courses", te: "కోర్సులు చూడండి" },
    blurb: { en: "Learn AI, data and cloud skills with certificates from Google, IBM and Meta.", te: "Google, IBM, Meta సర్టిఫికెట్లతో AI, డేటా, క్లౌడ్ నైపుణ్యాలు నేర్చుకోండి." },
    placements: ["ai", "job", "wfh"],
    program: { signup: "https://www.coursera.org/about/affiliates", network: "Impact", pays: "About 15–45% depending on product; monthly subscriptions earn on the first payment." },
  },
  {
    slug: "udemy", name: "Udemy",
    cta: { en: "Browse Udemy", te: "Udemy చూడండి" },
    blurb: { en: "Low-cost video courses on ChatGPT, Python, n8n, Excel and more.", te: "ChatGPT, Python, n8n, Excel వంటి వాటిపై తక్కువ ధర వీడియో కోర్సులు." },
    placements: ["ai", "freelance", "wfh"],
    program: { signup: "https://www.udemy.com/affiliate/", network: "Impact (or Indian networks: Cuelinks, EarnKaro, INRDeals)", pays: "Percentage of course sales — rate shown after approval." },
  },
  {
    slug: "upgrad", name: "upGrad",
    cta: { en: "See programmes", te: "ప్రోగ్రామ్‌లు చూడండి" },
    blurb: { en: "Online degrees and AI/data science programmes from Indian and global universities.", te: "భారత, విదేశీ విశ్వవిద్యాలయాల ఆన్‌లైన్ డిగ్రీలు, AI/డేటా సైన్స్ ప్రోగ్రామ్‌లు." },
    placements: ["ai", "job"],
    program: { signup: "https://www.cuelinks.com/", network: "Indian networks (Cuelinks / EarnKaro / INRDeals)", pays: "Per-lead or per-enrolment payout set by the network campaign." },
  },
  {
    slug: "canva", name: "Canva Pro",
    cta: { en: "Try Canva Pro", te: "Canva Pro ప్రయత్నించండి" },
    blurb: { en: "Design social posts, thumbnails and resumes for your clients or yourself.", te: "క్లయింట్ల కోసం లేదా మీ కోసం సోషల్ పోస్టులు, థంబ్‌నెయిల్స్, రెజ్యూమెలు డిజైన్ చేయండి." },
    placements: ["freelance", "wfh"],
    program: { signup: "https://www.canva.com/affiliates/", network: "Impact", pays: "Fixed payout per new Canva Pro subscriber — check current rate after approval." },
  },
  {
    slug: "hostinger", name: "Hostinger",
    cta: { en: "Build your site", te: "మీ సైట్ నిర్మించండి" },
    blurb: { en: "A portfolio website with your own domain helps you win better clients.", te: "మీ సొంత డొమైన్‌తో పోర్ట్‌ఫోలియో వెబ్‌సైట్ మంచి క్లయింట్లను తెస్తుంది." },
    placements: ["freelance"],
    program: { signup: "https://www.hostinger.com/affiliates", network: "Direct, or Cuelinks / EarnKaro / INRDeals in India", pays: "Percentage of the first hosting purchase." },
  },
  {
    slug: "payoneer", name: "Payoneer",
    cta: { en: "Open account", te: "ఖాతా తెరవండి" },
    blurb: { en: "Get paid in USD, EUR or GBP by foreign clients and withdraw to your Indian bank.", te: "విదేశీ క్లయింట్ల నుండి USD, EUR, GBPలో చెల్లింపులు పొంది మీ భారత బ్యాంక్‌కు తీసుకోండి." },
    placements: ["freelance", "remote", "wfh"],
    program: { signup: "https://www.payoneer.com/refer-a-friend/", network: "Payoneer Refer-a-Friend (or Payoneer affiliate programme)", pays: "Fixed reward when the referred user receives their first qualifying payments." },
  },
  {
    slug: "wise", name: "Wise",
    cta: { en: "Get Wise", te: "Wise పొందండి" },
    blurb: { en: "Receive international salary or client payments at the real exchange rate.", te: "విదేశీ జీతం లేదా క్లయింట్ చెల్లింపులను నిజమైన మారకపు రేటుకు పొందండి." },
    placements: ["remote"],
    program: { signup: "https://wise.com/gb/affiliate-program/", network: "Partnerize", pays: "Fixed payout per new customer. No paid ads or 'free transfer' claims without Wise's approval." },
  },
  {
    slug: "flexjobs", name: "FlexJobs",
    cta: { en: "See FlexJobs", te: "FlexJobs చూడండి" },
    blurb: { en: "Paid membership with hand-screened remote and flexible jobs.", te: "పరిశీలించిన రిమోట్, ఫ్లెక్సిబుల్ ఉద్యోగాలతో పెయిడ్ సభ్యత్వం." },
    placements: ["remote", "wfh"],
    program: { signup: "https://www.flexjobs.com/affiliates", network: "FlexJobs affiliate programme", pays: "Commission on paid memberships." },
  },
  {
    slug: "zety", name: "Zety",
    cta: { en: "Build a resume", te: "రెజ్యూమె తయారు చేయండి" },
    blurb: { en: "Make an ATS-friendly resume and cover letter in minutes.", te: "ATSకి అనువైన రెజ్యూమె, కవర్ లెటర్ నిమిషాల్లో తయారు చేయండి." },
    placements: ["job", "remote", "wfh"],
    program: { signup: "https://zety.com/affiliates", network: "Zety affiliate programme", pays: "About $12 per sale (one-time)." },
  },
];

export const AFFILIATE_SLUGS = AFFILIATE_CATALOG.map((p) => p.slug);
export const MAX_PER_SLOT: Record<Placement, number> = { remote: 3, ai: 3, freelance: 3, wfh: 3, job: 2, post: 3 };

export function getPartner(slug: string): AffiliatePartner | undefined {
  return AFFILIATE_CATALOG.find((p) => p.slug === slug);
}

/** Only https links to a real public host. Blocks javascript:, data:, localhost and raw IPs. */
export function isValidAffiliateUrl(raw: string | null | undefined): boolean {
  if (!raw || raw.length > 1000) return false;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || /^[\d.]+$/.test(h) || h.includes(":") || !h.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
}

export interface AffiliateLink { url: string | null; enabled: boolean; placements: Placement[] | null }

/** Environment fallback: AFFILIATE_URL_FIVERR=https://… (works in demo mode, no database needed). */
export function envLinks(env: Record<string, string | undefined>): Record<string, AffiliateLink> {
  const out: Record<string, AffiliateLink> = {};
  for (const slug of AFFILIATE_SLUGS) {
    const url = env[`AFFILIATE_URL_${slug.toUpperCase().replace(/-/g, "_")}`];
    if (isValidAffiliateUrl(url)) out[slug] = { url: url!.trim(), enabled: true, placements: null };
  }
  return out;
}

/** Database rows win over env when they carry a link; a row without a link falls back to env. */
export function mergeLinks(db: Record<string, AffiliateLink>, env: Record<string, AffiliateLink>): Record<string, AffiliateLink> {
  const out: Record<string, AffiliateLink> = { ...env };
  for (const [slug, row] of Object.entries(db)) if (row.url) out[slug] = row;
  return out;
}

export interface ResolvedPartner extends AffiliatePartner { url: string }

/** Live partners for one placement, in catalog order, capped per slot. */
export function partnersFor(placement: Placement, links: Record<string, AffiliateLink>, limit = MAX_PER_SLOT[placement]): ResolvedPartner[] {
  const out: ResolvedPartner[] = [];
  for (const p of AFFILIATE_CATALOG) {
    const l = links[p.slug];
    if (!l?.enabled || !isValidAffiliateUrl(l.url)) continue;
    if (!(l.placements?.length ? l.placements : p.placements).includes(placement)) continue;
    out.push({ ...p, url: l.url!.trim() });
    if (out.length >= limit) break;
  }
  return out;
}

export function asPlacement(v: string | null | undefined): Placement | null {
  return PLACEMENTS.includes(v as Placement) ? (v as Placement) : null;
}

/** Map a section page to its slot. Local and government pages carry no affiliate slot. */
export function placementForSection(section: string): Placement | null {
  return asPlacement(section);
}
