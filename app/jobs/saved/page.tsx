import type { Metadata } from "next";
import Link from "next/link";
import { DeviceSavedList } from "@/components/DeviceSavedList";
import { JobCard } from "@/components/JobCard";
import { getDict } from "@/lib/i18n-server";
import { getJobsByIds, getSavedJobIds } from "@/lib/jobs/data";
import { currentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Saved jobs", robots: { index: false } };

export default async function SavedPage() {
  const { t } = await getDict();
  const user = await currentUser();
  const ids = await getSavedJobIds();
  const jobs = await getJobsByIds(ids);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6">
      <h1 className="t-display">{t.saved}</h1>
      {!user && (
        <p className="mt-4 rounded-2xl bg-surface p-4 text-ink-soft">
          {t.signInToSave} <Link href="/login?next=/jobs/saved" className="font-semibold text-ink underline underline-offset-4">{t.signIn}</Link>
        </p>
      )}
      {jobs.length > 0 && <ul className="mt-6 grid gap-3">{jobs.map((j) => <li key={j.id}><JobCard job={j} t={t} saved /></li>)}</ul>}
      <DeviceSavedList exclude={ids} />
      {user && jobs.length === 0 && <p className="mt-6 text-ink-soft">{t.savedEmpty}</p>}
      {!user && <noscript><p className="mt-6 text-ink-soft">{t.savedEmpty}</p></noscript>}
    </div>
  );
}
