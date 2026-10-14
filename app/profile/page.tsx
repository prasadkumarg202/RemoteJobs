import type { Metadata } from "next";
import Link from "next/link";
import { LangToggle } from "@/components/LangToggle";
import { getDict } from "@/lib/i18n-server";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { markNotificationsRead, signOut } from "./actions";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

export default async function ProfilePage() {
  const { t } = await getDict();
  const profile = await currentProfile();
  const sb = await supabaseServer();
  const notes = profile && sb
    ? ((await sb.from("job_notifications").select("id,title,body,url,read_at,created_at").order("created_at", { ascending: false }).limit(30)).data ?? [])
    : [];
  const unread = notes.filter((n) => !n.read_at).length;
  const row = "flex min-h-14 items-center justify-between rounded-2xl border border-line bg-surface px-4";
  return (
    <div className="mx-auto max-w-2xl px-4 pt-6">
      <h1 className="t-display">{t.profile}</h1>
      {profile ? (
        <p className="mt-2 text-ink-soft">{profile.display_name || profile.phone || profile.email}</p>
      ) : (
        <Link href="/login?next=/profile" className="mt-4 inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-paper">{t.signIn}</Link>
      )}
      <div className="mt-6 grid gap-2">
        <div className={row}><span>{t.language}</span><LangToggle /></div>
        <Link href="/jobs/saved" className={row}>{t.saved}<span aria-hidden>›</span></Link>
        <Link href="/jobs/alerts" className={row}>{t.alerts}<span aria-hidden>›</span></Link>
        <Link href="/jobs/post" className={row}>{t.postJob}<span aria-hidden>›</span></Link>
        {profile && (profile.role === "admin" || profile.role === "moderator") && <Link href="/admin/jobs" className={row}>Jobs admin<span aria-hidden>›</span></Link>}
      </div>
      {profile && (
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="t-h2">Notifications {unread > 0 && <span className="ml-1 rounded-full bg-turmeric px-2 py-0.5 t-tiny text-ink">{unread}</span>}</h2>
            {unread > 0 && <form action={markNotificationsRead}><button className="t-small underline underline-offset-4">Mark all read</button></form>}
          </div>
          {notes.length === 0 ? <p className="mt-3 text-ink-soft">New jobs matching your alerts will appear here.</p> : (
            <ul className="mt-3 grid gap-2">
              {notes.map((n) => (
                <li key={n.id}>
                  <Link href={n.url ?? "/jobs"} className={`block rounded-2xl border p-4 ${n.read_at ? "border-line bg-surface" : "border-turmeric bg-turmeric-soft"}`}>
                    <span className="font-semibold">{n.title}</span>
                    {n.body && <span className="block t-small text-ink-soft">{n.body}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <form action={signOut} className="mt-8"><button className="min-h-12 rounded-full border border-line-strong px-6">{t.signOut}</button></form>
        </section>
      )}
    </div>
  );
}
