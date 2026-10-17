import type { Metadata } from "next";
import Link from "next/link";
import { AffiliateSlot } from "@/components/AffiliateSlot";
import { PostJobForm } from "@/components/PostJobForm";
import { DEMO_MODE } from "@/lib/env";
import { getDict } from "@/lib/i18n-server";
import { currentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Post a job", description: "Post a job on Mana Kosamu for free. Every job is reviewed before it goes live." };

export default async function PostJobPage() {
  const { t, lang } = await getDict();
  const user = await currentUser();
  return (
    <div className="mx-auto max-w-2xl px-4 pt-6">
      <h1 className="t-display">{t.postJob}</h1>
      <p className="mt-3 max-w-[56ch] text-ink-soft">{t.postIntro}</p>
      <div className="mt-6">
        {DEMO_MODE ? (
          <p className="rounded-2xl bg-turmeric-soft p-4 text-turmeric-ink">{t.demoBanner}</p>
        ) : !user || !user.phone ? (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p>Verify your mobile number with a one-time code to post a job.</p>
            <Link href="/login?next=/jobs/post" className="mt-4 inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-paper">{t.signIn}</Link>
          </div>
        ) : (
          <PostJobForm phone={user.phone ? `+${user.phone.replace(/^\+/, "")}` : null} />
        )}
      </div>
      <AffiliateSlot placement="post" t={t} lang={lang} />
    </div>
  );
}
