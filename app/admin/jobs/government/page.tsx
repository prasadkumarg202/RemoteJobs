import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DISTRICT_BY_SLUG } from "@engine/districts.ts";
import { GovNotificationForm } from "@/components/GovNotificationForm";
import { DEMO_MODE } from "@/lib/env";
import { isAdmin, supabaseServer } from "@/lib/supabase/server";
import { closeGovNotification } from "../actions";

export const metadata: Metadata = { title: "Government notifications", robots: { index: false } };
export const dynamic = "force-dynamic";

type Row = { id: string; slug: string; title: string; company_name: string; state: string | null; district: string | null; expires_at: string | null; is_active: boolean; is_verified: boolean; created_at: string };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—");

export default async function GovAdminPage() {
  if (!DEMO_MODE && !(await isAdmin())) notFound();
  const sb = await supabaseServer();
  const rows: Row[] = sb ? (((await sb.from("jobs").select("id,slug,title,company_name,state,district,expires_at,is_active,is_verified,created_at")
    .eq("is_government", true).order("created_at", { ascending: false }).limit(100)).data ?? []) as Row[]) : [];
  const now = Date.now();
  return (
    <div className="mx-auto max-w-4xl px-4 pt-6">
      <Link href="/admin/jobs" className="t-small text-ink-soft underline underline-offset-4">← Jobs admin</Link>
      <h1 className="t-h1 mt-2">Government notifications</h1>
      <p className="mt-2 max-w-[70ch] t-small text-ink-soft">
        Add notifications from official recruitment portals only (APPSC, TGPSC, UPSC, SSC, IBPS, RRB, police boards, departments). Each job links to the original notification and is removed automatically after its last date.
      </p>
      {DEMO_MODE && <p className="mt-3 rounded-lg bg-turmeric-soft p-3 t-small text-turmeric-ink">Demo mode: connect Supabase to publish.</p>}
      <div className="mt-6"><GovNotificationForm disabled={DEMO_MODE} /></div>

      <h2 className="t-h2 mt-10">Published</h2>
      {rows.length === 0 ? <p className="mt-2 text-ink-soft">None yet.</p> : (
        <ul className="mt-3 grid gap-2">
          {rows.map((r) => {
            const live = r.is_active && (!r.expires_at || new Date(r.expires_at).getTime() > now);
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/jobs/${r.slug}`} className="font-semibold hover:underline">{r.title}</Link>
                  <p className="t-tiny text-ink-soft">{r.company_name} · {[r.district ? DISTRICT_BY_SLUG[r.district]?.name : null, r.state ?? "All India"].filter(Boolean).join(", ")} · Last date {day(r.expires_at)}{r.is_verified ? "" : " · Needs verification"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 t-tiny ${live ? "bg-leaf-soft text-leaf" : "bg-closed-soft text-ink-soft"}`}>{live ? "Live" : "Closed"}</span>
                  {live && <form action={closeGovNotification}><input type="hidden" name="id" value={r.id} /><button className="min-h-10 rounded-full border border-line-strong px-3 t-small">Close now</button></form>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
