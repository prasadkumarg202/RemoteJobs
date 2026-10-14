import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DEMO_MODE } from "@/lib/env";
import { getAdminAnalytics, getAdminStats, type SourceHealth } from "@/lib/jobs/admin-data";
import { isAdmin, supabaseServer } from "@/lib/supabase/server";
import { runSyncNow, setSourceEnabled, updateRate } from "./actions";

export const metadata: Metadata = { title: "Jobs admin", robots: { index: false } };
export const dynamic = "force-dynamic";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "Never");

function Stat({ label, value, href, tone }: { label: string; value: number; href?: string; tone?: "warn" }) {
  const body = (
    <>
      <span className={`block text-3xl font-semibold ${tone === "warn" && value > 0 ? "text-warn" : ""}`} style={{ fontStretch: "110%" }}>{value.toLocaleString("en-IN")}</span>
      <span className="t-small text-ink-soft">{label}</span>
    </>
  );
  return href ? <Link href={href} className="rounded-2xl border border-line bg-surface p-4 hover:border-ink-faint">{body}</Link> : <div className="rounded-2xl border border-line bg-surface p-4">{body}</div>;
}

function SourceRow({ s }: { s: SourceHealth }) {
  const healthy = s.last_success_at && (!s.last_error_at || s.last_success_at > s.last_error_at);
  const status = !s.enabled ? { label: "Disabled", cls: "bg-closed-soft text-ink-soft" } : healthy ? { label: "Healthy", cls: "bg-leaf-soft text-leaf" } : s.last_error_at ? { label: "Failing", cls: "bg-warn-soft text-warn" } : { label: "Not run yet", cls: "bg-turmeric-soft text-turmeric-ink" };
  return (
    <tr className="border-t border-line align-top">
      <td className="py-3 pr-3"><p className="font-semibold">{s.name}</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 t-tiny ${status.cls}`}>{status.label}</span></td>
      <td className="py-3 pr-3 t-small">{when(s.last_success_at)}</td>
      <td className="py-3 pr-3 t-small">{s.last_error ? <><span className="text-warn">{when(s.last_error_at)}</span><br /><span className="text-ink-faint">{s.last_error.slice(0, 120)}</span></> : "—"}</td>
      <td className="py-3 pr-3 t-small">{s.last_jobs_fetched ?? "—"}</td>
      <td className="py-3 pr-3 t-small">{s.last_jobs_inserted ?? "—"}</td>
      <td className="py-3 pr-3 t-small">{s.active_jobs}</td>
      <td className="py-3 t-small">
        <div className="flex flex-wrap gap-2">
          <form action={runSyncNow}><input type="hidden" name="slug" value={s.slug} /><button disabled={!s.enabled || DEMO_MODE} className="min-h-10 rounded-full bg-ink px-3 text-paper disabled:opacity-40">Run sync</button></form>
          <form action={setSourceEnabled} className="flex items-center gap-2">
            <input type="hidden" name="id" value={s.id} /><input type="hidden" name="enabled" value={String(!s.enabled)} />
            {!s.enabled && !s.terms_verified_at && <label className="flex items-center gap-1 t-tiny"><input type="checkbox" name="terms_ack" required /> Terms reviewed</label>}
            <button disabled={DEMO_MODE} className="min-h-10 rounded-full border border-line-strong px-3 disabled:opacity-40">{s.enabled ? "Disable" : "Enable"}</button>
          </form>
        </div>
        <p className="mt-1 t-tiny text-ink-faint">Min interval {s.min_interval_minutes} min{s.terms_verified_at ? `, terms checked ${s.terms_verified_at.slice(0, 10)}` : ", terms not reviewed"}</p>
      </td>
    </tr>
  );
}

export default async function AdminJobsPage() {
  if (!DEMO_MODE && !(await isAdmin())) notFound();
  const stats = await getAdminStats();
  const analytics = await getAdminAnalytics(30);
  const sb = await supabaseServer();
  const rates = sb ? ((await sb.from("exchange_rates").select("*").order("currency")).data ?? []) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="t-h1">Jobs admin</h1>
        <Link href="/admin/jobs/moderation" className="min-h-11 rounded-full bg-ink px-5 py-2.5 font-medium text-paper">Moderation queue ({stats.pending + stats.open_reports})</Link>
      </div>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Totals">
        <Stat label="Total jobs" value={stats.total} />
        <Stat label="Active jobs" value={stats.active} />
        <Stat label="Remote jobs" value={stats.remote} />
        <Stat label="AI jobs" value={stats.ai} />
        <Stat label="Freelance jobs" value={stats.freelance} />
        <Stat label="India eligible" value={stats.india_eligible} />
        <Stat label="Added today" value={stats.added_today} />
        <Stat label="Expired today" value={stats.expired_today} />
        <Stat label="Duplicates merged" value={stats.duplicates} />
        <Stat label="Flagged jobs" value={stats.flagged} href="/admin/jobs/moderation" tone="warn" />
      </section>

      <section className="mt-10">
        <h2 className="t-h2">Source health</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface px-4">
          <table className="w-full min-w-[860px] text-left">
            <thead className="t-small text-ink-faint"><tr><th className="py-3 font-medium">Source</th><th className="font-medium">Last successful sync</th><th className="font-medium">Last error</th><th className="font-medium">Fetched</th><th className="font-medium">Inserted</th><th className="font-medium">Live jobs</th><th className="font-medium">Actions</th></tr></thead>
            <tbody>{stats.sources.filter((s) => !["employer", "manual"].includes(s.slug)).map((s) => <SourceRow key={s.slug} s={s} />)}</tbody>
          </table>
        </div>
        <details className="mt-3 t-small">
          <summary className="cursor-pointer text-ink-soft">Recent sync runs</summary>
          <ul className="mt-2 grid gap-1">
            {stats.sources.flatMap((s) => s.recent_logs.map((l) => (
              <li key={s.slug + l.started_at} className="rounded-lg bg-surface px-3 py-2">
                <b>{s.name}</b> {when(l.started_at)}: {l.status}, found {l.jobs_found}, added {l.jobs_added}, updated {l.jobs_updated}, duplicates {l.jobs_duplicates}, expired {l.jobs_expired}{l.used_fallback ? ", used RSS fallback" : ""}{l.errors?.length ? ` (${l.errors.length} warnings)` : ""}
              </li>
            )))}
          </ul>
        </details>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="t-h2">Analytics, last 30 days</h2>
          {!analytics ? <p className="mt-3 text-ink-soft">Analytics appear once Supabase is connected and people use the site.</p> : (
            <div className="mt-3 grid gap-4 t-small">
              <p className="text-ink-soft">{Object.entries(analytics.events).map(([k, v]) => `${k.replace("_", " ")}: ${v}`).join(", ") || "No events yet"}</p>
              <Top title="Most searched" rows={analytics.top_searches.map((r) => [r.query, r.n])} />
              <Top title="Most viewed jobs" rows={analytics.most_viewed.map((r) => [`${r.title} (${r.company_name})`, r.n])} />
              <Top title="Most applied category" rows={analytics.most_applied_category.map((r) => [r.category, r.n])} />
              <Top title="Most popular AI skills" rows={analytics.popular_ai_skills.map((r) => [r.skill, r.n])} />
              <Top title="Searches by section (remote vs local)" rows={Object.entries(analytics.searches_by_section)} />
            </div>
          )}
        </div>
        <div>
          <h2 className="t-h2">Exchange rates (INR per unit)</h2>
          <p className="mt-1 t-small text-ink-soft">Used only for the approximate ₹ shown next to foreign salaries. Original salaries are never changed.</p>
          <ul className="mt-3 grid gap-2">
            {rates.map((r) => (
              <li key={r.currency}>
                <form action={updateRate} className="flex items-center gap-2">
                  <input type="hidden" name="currency" value={r.currency} />
                  <span className="w-12 font-semibold">{r.currency}</span>
                  <input name="rate" type="number" step="0.0001" min="0" defaultValue={r.inr_per_unit} disabled={r.currency === "INR"} className="min-h-10 w-32 rounded-lg border border-line-strong bg-surface px-2" />
                  <button disabled={r.currency === "INR"} className="min-h-10 rounded-full border border-line-strong px-3 t-small disabled:opacity-40">Save</button>
                  <span className="t-tiny text-ink-faint">{r.source}, {when(r.updated_at)}</span>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Top({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      {rows.length ? <ol className="mt-1 grid gap-0.5">{rows.slice(0, 8).map(([k, v]) => <li key={k} className="flex justify-between gap-3 border-b border-line py-1"><span className="truncate">{k}</span><span className="text-ink-faint">{v}</span></li>)}</ol> : <p className="text-ink-faint">No data yet</p>}
    </div>
  );
}
