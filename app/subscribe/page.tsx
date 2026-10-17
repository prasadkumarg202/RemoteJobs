import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SubscribePlans } from "@/components/SubscribePlans";
import { getAccessSettings, getMyAccess, getPlans } from "@/lib/access/server";
import { DEMO_MODE } from "@/lib/env";
import { fmt } from "@/lib/i18n";
import { getDict } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "Subscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const n = (await searchParams).next;
  const next = n && n.startsWith("/") && !n.startsWith("//") ? n : "/jobs";
  if (DEMO_MODE) redirect(next);
  const { t } = await getDict();
  const me = await getMyAccess();
  if (!me.signedIn) redirect(`/login?next=${encodeURIComponent(`/subscribe?next=${next}`)}`);
  if (me.status?.device === "none") redirect(`/device?next=${encodeURIComponent(`/subscribe?next=${next}`)}`);
  if (me.status?.device === "other") redirect(`/device?blocked=1&next=${encodeURIComponent(next)}`);
  const [plans, settings] = await Promise.all([getPlans(), getAccessSettings()]);
  const until = me.status?.accessUntil;
  const active = !!until && until > Date.now();
  const sub = me.subscription;
  const raw = me.raw ?? {};

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8">
      <h1 className="t-h1">{t.subscribeTitle}</h1>
      <p className="mt-2 max-w-[60ch] text-ink-soft">{t.subscribeIntro}</p>

      <div className={`mt-5 rounded-2xl p-4 t-small ${active ? "bg-leaf-soft text-leaf" : "bg-turmeric-soft text-turmeric-ink"}`}>
        {active
          ? <>{fmt(sub?.provider === "trial" ? t.trialActive : sub?.cancel_at_period_end ? t.cancelled : t.activeUntil, { date: day(new Date(until!).toISOString()) })}{" "}<Link href={next} className="font-semibold underline">→ {t.jobs}</Link></>
          : t.noAccess}
      </div>

      <div className="mt-6">
        <SubscribePlans plans={plans} next={next} canCancel={sub?.provider === "razorpay" && !sub.cancel_at_period_end && ["active", "authenticated", "pending"].includes(sub.status)} />
      </div>

      <p className="mt-6 t-tiny text-ink-faint">
        {raw.device_label ? fmt(t.yourDevice, { device: String(raw.device_label), date: day(String(raw.bound_at)) }) + " " : ""}
        UPI AutoPay, cards and netbanking via Razorpay. {settings.device_change_cooldown_days > 0 ? `You can move your account to another device once every ${settings.device_change_cooldown_days} days.` : ""}{" "}
        <Link href="/refunds" className="underline">{t.refunds}</Link> · <Link href="/terms" className="underline">Terms</Link>
      </p>
    </div>
  );
}
