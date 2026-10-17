# Affiliate partners — earning from Mana Kosamu

Mana Kosamu can show a small **“Sponsored”** block of partner tools beside the job listings. When someone signs up or buys through your link, the partner pays you a commission.

**Nothing is shown until you add your own tracking link** — the code ships with every partner switched off.

## Where the blocks appear

| Placement | Page | Shows (by default) |
|---|---|---|
| `freelance` | /jobs/freelance | Fiverr, Upwork, Udemy, Canva, Hostinger, Payoneer (first 3 with links) |
| `ai` | /jobs/ai and AI sub-pages | Coursera, Udemy, upGrad |
| `remote` | /jobs/remote, /jobs/remote/india | Payoneer, Wise, FlexJobs, Zety |
| `wfh` | /jobs/work-from-home | Coursera, Udemy, Canva, Payoneer, FlexJobs, Zety |
| `job` | Job detail sidebar (max 2) | Coursera, upGrad, Zety |
| `post` | /jobs/post (employers) | Fiverr, Upwork, Freelancer.com |

Local and Government pages never show partners. Each slot shows at most 3 partners (2 on job pages), in the order of the catalog. You can change any partner's placements in the admin screen.

## The partners

| Partner | Slug | Default placements | Network | What it pays (Oct 2026 — check before joining) | Sign up |
|---|---|---|---|---|---|
| **Fiverr** | `fiverr` | post, freelance | Fiverr Affiliates (direct) | 25% of a new buyer's first order + 10% revenue share for 12 months (Logo Maker: $30 + 10%). Pays on BUYERS, not sellers. | [Join](https://www.fiverr.com/partnerships/affiliates) |
| **Upwork** | `upwork` | post, freelance | Impact | 70% of a new client's first contract spend, capped at $150. No trademark bidding. International affiliates accepted. | [Join](https://www.upwork.com/affiliates) |
| **Freelancer.com** | `freelancer` | post | Freelancer.com referral programme (in your account) | Referral credit/commission per Freelancer.com's current referral terms — check in your account before enabling. | [Join](https://www.freelancer.com/users/settings/referrals) |
| **Coursera** | `coursera` | ai, job, wfh | Impact | About 15–45% depending on product; monthly subscriptions earn on the first payment. | [Join](https://www.coursera.org/about/affiliates) |
| **Udemy** | `udemy` | ai, freelance, wfh | Impact (or Indian networks: Cuelinks, EarnKaro, INRDeals) | Percentage of course sales — rate shown after approval. | [Join](https://www.udemy.com/affiliate/) |
| **upGrad** | `upgrad` | ai, job | Indian networks (Cuelinks / EarnKaro / INRDeals) | Per-lead or per-enrolment payout set by the network campaign. | [Join](https://www.cuelinks.com/) |
| **Canva Pro** | `canva` | freelance, wfh | Impact | Fixed payout per new Canva Pro subscriber — check current rate after approval. | [Join](https://www.canva.com/affiliates/) |
| **Hostinger** | `hostinger` | freelance | Direct, or Cuelinks / EarnKaro / INRDeals in India | Percentage of the first hosting purchase. | [Join](https://www.hostinger.com/affiliates) |
| **Payoneer** | `payoneer` | freelance, remote, wfh | Payoneer Refer-a-Friend (or Payoneer affiliate programme) | Fixed reward when the referred user receives their first qualifying payments. | [Join](https://www.payoneer.com/refer-a-friend/) |
| **Wise** | `wise` | remote | Partnerize | Fixed payout per new customer. No paid ads or 'free transfer' claims without Wise's approval. | [Join](https://wise.com/gb/affiliate-program/) |
| **FlexJobs** | `flexjobs` | remote, wfh | FlexJobs affiliate programme | Commission on paid memberships. | [Join](https://www.flexjobs.com/affiliates) |
| **Zety** | `zety` | job, remote, wfh | Zety affiliate programme | About $12 per sale (one-time). | [Join](https://zety.com/affiliates) |

**Important — who earns you money:** Fiverr, Upwork and Freelancer.com pay when a new **buyer/client** signs up and spends, *not* when a freelancer joins to sell. That's why they are on the employer “Post a job” page and labelled “Hire on …”. Courses (Coursera, Udemy, upGrad), Canva, Hostinger, Payoneer, Wise, FlexJobs and Zety pay on job seekers/freelancers, so they sit on the job pages.

**Indian networks:** if a partner's direct programme does not accept you, join **Cuelinks**, **EarnKaro** or **INRDeals** — they carry Udemy, Coursera, upGrad, Hostinger and many Indian brands, and pay to Indian bank accounts in INR.

## How to switch a partner on

1. Open the partner's **Join** link above and apply (use your site URL and describe it as a jobs portal for Andhra Pradesh/Telangana).
2. After approval, copy your personal tracking link from the partner's dashboard (Impact, Partnerize, Awin, Cuelinks …).
3. Go to **/admin/jobs → Affiliate partners**, paste the link, choose where it should appear, tick **Show on site**, Save.
4. Clicks are counted per partner and placement (last 30 days) on the same screen. Sales/commissions are reported in the partner's own dashboard.

Without Supabase (demo mode) you can test with environment variables, e.g.
`AFFILIATE_URL_FIVERR=https://go.fiverr.com/visit/?bta=…` — one variable per slug (`AFFILIATE_URL_<SLUG>`). A link saved in the admin screen overrides the env variable.

## Rules built in

- **Disclosure:** every block is labelled “Sponsored” with the sentence *“Mana Kosamu may earn a commission if you sign up through these links. It never changes which jobs we show.”* (Telugu too). ASCI's guidelines in India require paid/affiliate relationships to be clearly disclosed.
- Links use `rel="sponsored nofollow noopener"`, open in a new tab and go through `/out/<slug>` (blocked in robots.txt, `noindex`), which logs an `affiliate_click` event with no personal data and then redirects.
- Only partners in the catalog with an **https** link saved by an admin can be reached — `/out/` is not an open redirect. The browser can't fake affiliate clicks through `/api/events`.
- Affiliate links never change job ranking, and aggregated jobs are not affiliate-tagged.
- Respect each programme's rules — e.g. **Upwork:** no bidding on “Upwork” in Google Ads; **Wise:** no paid ads or “free transfer” claims without approval. Don't put affiliate links in WhatsApp groups or emails unless the programme allows it.

## Adding another partner

Add an entry to `AFFILIATE_CATALOG` in `lib/affiliates/catalog.ts` (name, EN + Telugu text, placements, programme info), add its slug to the seed `insert` in a new migration, and run `npm test` (a test checks the catalog and seed match).

## Other ways to earn (not built)

- **Featured employer listings** — the `is_featured` flag already exists; charge local employers to pin a job (needs a payment gateway such as Razorpay).
- **Google AdSense** on listing pages (keep it off job detail pages so it isn't mistaken for the employer's content).
