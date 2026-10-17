"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { DISTRICTS } from "@engine/districts.ts";
import { createGovNotification, type GovFormState } from "@/app/admin/jobs/actions";
import { GOV_ORGS, GOV_ORG_BY_SLUG } from "@/lib/jobs/government";

const field = (err?: string) => `min-h-11 w-full rounded-lg border bg-paper px-3 ${err ? "border-warn" : "border-line-strong"}`;

function F({ label, k, e, hint, children }: { label: string; k: string; e: Record<string, string>; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 t-small">
      <span className="font-medium">{label}</span>
      {children}
      {hint && !e[k] && <span className="t-tiny text-ink-faint">{hint}</span>}
      {e[k] && <span className="text-warn">{e[k]}</span>}
    </label>
  );
}

export function GovNotificationForm({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState<GovFormState | null, FormData>(createGovNotification, null);
  const [org, setOrg] = useState("appsc");
  const [scope, setScope] = useState<"AP" | "TS" | "IN">("AP");
  const e = state?.errors ?? {};
  const o = GOV_ORG_BY_SLUG[org];
  return (
    <form action={action} className="grid gap-4 rounded-2xl border border-line bg-surface p-5">
      {state && (
        <p role="status" className={`rounded-lg p-3 t-small ${state.ok ? "bg-leaf-soft text-leaf" : "bg-warn-soft text-warn"}`}>
          {state.message} {state.slug && <Link href={`/jobs/${state.slug}`} className="underline underline-offset-4">View job</Link>}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Recruiting organisation" k="orgSlug" e={e}>
          <select name="org" value={org} onChange={(ev) => { setOrg(ev.target.value); const sc = GOV_ORG_BY_SLUG[ev.target.value].scope; if (ev.target.value !== "other") setScope(sc); }} className={field(e.orgSlug)}>
            {GOV_ORGS.map((g) => <option key={g.slug} value={g.slug}>{g.short ? `${g.short} — ${g.name}` : g.name}</option>)}
          </select>
        </F>
        {org === "other"
          ? <F label="Department name" k="orgName" e={e}><input name="org_name" className={field(e.orgName)} placeholder="e.g. Health, Medical & Family Welfare Dept, AP" /></F>
          : <p className="self-end t-tiny text-ink-faint">Official site: <a href={o.portal} target="_blank" rel="noopener noreferrer" className="underline">{o.portal.replace(/^https:\/\//, "")}</a></p>}
        <F label="Posts are in" k="scope" e={e}>
          <select name="scope" value={scope} onChange={(ev) => setScope(ev.target.value as "AP" | "TS" | "IN")} className={field(e.scope)}>
            <option value="AP">Andhra Pradesh</option><option value="TS">Telangana</option><option value="IN">All India</option>
          </select>
        </F>
        <F label="District (optional)" k="district" e={e} hint="Only for district-level recruitment (e.g. DSC, DMHO, court posts).">
          <select name="district" defaultValue="" className={field(e.district)}>
            <option value="">—</option>
            {DISTRICTS.filter((d) => scope === "IN" || d.state === scope).sort((a, b) => a.name.localeCompare(b.name)).map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </select>
        </F>
      </div>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <F label="Post / exam name" k="postName" e={e}><input name="post_name" className={field(e.postName)} placeholder="e.g. Group-II Services" /></F>
        <F label="Notification no." k="notificationNo" e={e}><input name="notification_no" className={field()} placeholder="e.g. 11/2026" /></F>
        <F label="Vacancies" k="vacancies" e={e}><input name="vacancies" type="number" min={1} inputMode="numeric" className={field(e.vacancies)} /></F>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Qualification" k="qualification" e={e}><input name="qualification" className={field()} placeholder="e.g. Any degree" /></F>
        <F label="Age limit" k="ageLimit" e={e}><input name="age_limit" className={field()} placeholder="e.g. 18–42 years (relaxation as per rules)" /></F>
        <F label="Pay scale" k="salaryText" e={e}><input name="pay" className={field()} placeholder="e.g. ₹54,060 – ₹1,40,540" /></F>
        <F label="Application fee" k="fee" e={e}><input name="fee" className={field()} placeholder="e.g. ₹250 + ₹80 exam fee; SC/ST exempt" /></F>
        <F label="Apply from (optional)" k="startDate" e={e}><input name="start_date" type="date" className={field(e.startDate)} /></F>
        <F label="Last date to apply" k="lastDate" e={e} hint="The job disappears from the site after this date (IST)."><input name="last_date" type="date" required className={field(e.lastDate)} /></F>
      </div>
      <F label="Official notification link (PDF or page)" k="notificationUrl" e={e} hint="Must be on the organisation's official site, .gov.in or .nic.in.">
        <input name="notification_url" type="url" required placeholder="https://psc.ap.gov.in/…" className={field(e.notificationUrl)} />
      </F>
      <F label="Official apply link (optional)" k="applyUrl" e={e}><input name="apply_url" type="url" placeholder="https://…" className={field(e.applyUrl)} /></F>
      <F label="Other details (optional)" k="details" e={e}><textarea name="details" rows={4} className={`${field()} py-2`} placeholder="Exam pattern, important dates, reservation notes…" /></F>
      <label className="flex items-start gap-2 t-tiny text-ink-soft">
        <input type="checkbox" name="unofficial_ok" className="mt-0.5" />
        <span>The link is not on a .gov.in / .nic.in domain but I have confirmed it is the official recruitment site. (The job is then shown as “Needs verification”.)</span>
      </label>
      <button disabled={pending || disabled} className="min-h-12 justify-self-start rounded-full bg-ink px-6 font-semibold text-paper disabled:opacity-40">{pending ? "Publishing…" : "Publish notification"}</button>
    </form>
  );
}
