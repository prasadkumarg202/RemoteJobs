import Link from "next/link";
import { redirect } from "next/navigation";
import { ACCESS_MODE, getAccessSettings, getMyAccess, getPlans } from "@/lib/access/server";
import { DEMO_MODE } from "@/lib/env";
import { fmt } from "@/lib/i18n";
import { getDict } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

// Public landing page for the subscription app. In "open" mode (or demo mode) the jobs are free: go straight there.
export default async function Home() {
  if (DEMO_MODE || ACCESS_MODE === "open") redirect("/jobs");
  const { t } = await getDict();
  const [me, plans, settings] = await Promise.all([getMyAccess(), getPlans(), getAccessSettings()]);
  const hasAccess = !!me.status?.accessUntil && me.status.accessUntil > Date.now();
  const cheapest = plans.reduce<number | null>((m, p) => { const v = Math.round(p.price_inr / p.interval_months); return m === null || v < m ? v : m; }, null);
  const tiles = [
    { icon: "📍", title: t.localJobs, body: "Hyderabad, Vijayawada, Vizag, Guntur, Tirupati and every district of AP & Telangana." },
    { icon: "🌎", title: t.remoteJobs, body: "Remote jobs with India eligibility checked — no more “US only” surprises." },
    { icon: "🤖", title: t.aiJobsLong, body: "AI, ML, prompt engineering and automation roles, scored from the job description." },
    { icon: "⚡", title: t.freelance, body: "Short projects and hourly gigs with budgets shown in rupees." },
    { icon: "🏠", title: t.wfh, body: "Part-time, data entry, support and writing work you can do from home." },
    { icon: "🏛", title: t.government, body: "APPSC, TGPSC, UPSC, SSC, banks and railways — with the last date and official link." },
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 pt-10">
      <section className="max-w-3xl">
        <h1 className="t-display">{t.landingTitle}</h1>
        <p className="mt-4 max-w-[60ch] text-lg text-ink-soft">{t.landingSub}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {hasAccess ? (
            <Link href="/jobs" className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-paper">{t.jobs} →</Link>
          ) : (
            <Link href={me.signedIn ? "/subscribe" : "/login?next=/jobs"} className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-paper">
              {settings.trial_days > 0 && !(me.raw?.trial_used) ? t.startTrial : t.subscribeCta}
            </Link>
          )}
          {!me.signedIn && <Link href="/login" className="inline-flex min-h-12 items-center rounded-full border border-ink px-6 font-medium">{t.signIn}</Link>}
        </div>
        {cheapest !== null && !hasAccess && (
          <p className="mt-3 t-small text-ink-soft">{settings.trial_days > 0 ? fmt(t.trialDays, { n: settings.trial_days, price: cheapest }) : `From ₹${cheapest}${t.perMonth}. Cancel anytime.`}</p>
        )}
      </section>

      <section className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="What you get">
        {tiles.map((x) => (
          <div key={x.title} className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-2xl" aria-hidden>{x.icon}</p>
            <h2 className="mt-2 t-h3">{x.title}</h2>
            <p className="mt-1 t-small text-ink-soft">{x.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-12 grid gap-4 rounded-2xl bg-surface p-6 sm:grid-cols-3">
        <div><h3 className="font-semibold">Scam checks</h3><p className="mt-1 t-small text-ink-soft">Jobs that ask for fees or look suspicious are held back or marked “Needs verification”.</p></div>
        <div><h3 className="font-semibold">తెలుగు + English</h3><p className="mt-1 t-small text-ink-soft">Use the whole app in Telugu, with AI summaries of long job posts.</p></div>
        <div><h3 className="font-semibold">One account, one phone</h3><p className="mt-1 t-small text-ink-soft">Sign in with your mobile number — the OTP fills in automatically. Your plan works on the device you register.</p></div>
      </section>
    </div>
  );
}
