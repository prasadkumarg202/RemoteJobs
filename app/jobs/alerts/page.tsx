import type { Metadata } from "next";
import Link from "next/link";
import { AlertForm } from "@/components/AlertForm";
import { getDict } from "@/lib/i18n-server";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteAlert, toggleAlert } from "./actions";

export const metadata: Metadata = { title: "Job alerts", robots: { index: false } };

export default async function AlertsPage() {
  const { t } = await getDict();
  const sb = await supabaseServer();
  const user = sb ? (await sb.auth.getUser()).data.user : null;
  const alerts = user ? ((await sb!.from("job_alerts").select("*").order("created_at", { ascending: false })).data ?? []) : [];
  return (
    <div className="mx-auto max-w-2xl px-4 pt-6">
      <h1 className="t-display">{t.alerts}</h1>
      {!user ? (
        <p className="mt-4 text-ink-soft">{t.mustSignIn}. <Link href="/login?next=/jobs/alerts" className="font-semibold text-ink underline underline-offset-4">{t.signIn}</Link></p>
      ) : (
        <>
          <div className="mt-6"><AlertForm /></div>
          {alerts.length > 0 && (
            <ul className="mt-8 grid gap-2">
              {alerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.name}</p>
                    <p className="t-small text-ink-soft">{[a.keywords, a.category, a.india_mode && "India", a.remote_only && "Remote", a.ai_only && "AI", a.freelance_only && "Freelance"].filter(Boolean).join(", ") || "All new jobs"}</p>
                  </div>
                  <form action={toggleAlert}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="active" value={String(!a.is_active)} />
                    <button className="min-h-11 rounded-full border border-line-strong px-4 t-small">{a.is_active ? "Pause" : "Resume"}</button></form>
                  <form action={deleteAlert}><input type="hidden" name="id" value={a.id} />
                    <button className="min-h-11 rounded-full px-3 t-small text-warn">Delete</button></form>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
