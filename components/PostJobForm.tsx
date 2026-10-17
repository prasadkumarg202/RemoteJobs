"use client";
import { useActionState, useState } from "react";
import { submitJob, type PostState } from "@/app/jobs/post/actions";
import { DISTRICTS } from "@engine/districts.ts";
import { CITIES } from "./CityPicker";
import { useI18n } from "./I18nProvider";

// Defined at module level so inputs keep their values across re-renders.
function Err({ e, k }: { e: Record<string, string>; k: string }) {
  return e[k] ? <span className="t-small text-warn">{e[k]}</span> : null;
}
function Field({ label, k, e, children }: { label: string; k: string; e: Record<string, string>; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><span className="t-small font-medium">{label}</span>{children}<Err e={e} k={k} /></label>;
}

export function PostJobForm({ phone }: { phone: string | null }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<PostState | null, FormData>(submitJob, null);
  const [method, setMethod] = useState("whatsapp");
  const [mode, setMode] = useState("onsite");
  if (state?.ok) return <p role="status" className="rounded-2xl bg-leaf-soft p-5 text-leaf">{t.submittedForReview}</p>;
  const e = state?.errors ?? {};
  const field = (err?: string) => `min-h-12 w-full rounded-xl border bg-surface px-3 ${err ? "border-warn" : "border-line-strong"}`;
  return (
    <form action={action} className="grid gap-5" noValidate>
      <p className="rounded-xl bg-leaf-soft px-4 py-3 t-small text-leaf">Verified mobile: {phone}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field e={e} label="Your name" k="name"><input name="name" autoComplete="name" className={field(e.name)} /></Field>
        <Field e={e} label="Business / company" k="company"><input name="company" autoComplete="organization" className={field(e.company)} /></Field>
      </div>
      <Field e={e} label="Job title" k="title"><input name="title" className={field(e.title)} placeholder="e.g. Billing executive" /></Field>
      <Field e={e} label="Job description" k="description"><textarea name="description" rows={7} className={`${field(e.description)} py-3`} placeholder="What will the person do? Timings, requirements, benefits." /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field e={e} label={t.workMode} k="work_mode">
          <select name="work_mode" value={mode} onChange={(ev) => setMode(ev.target.value)} className={field(e.work_mode)}>
            <option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">{t.remote}</option>
          </select></Field>
        <Field e={e} label={t.employmentType} k="employment_type">
          <select name="employment_type" defaultValue="full_time" className={field(e.employment_type)}>
            {["full_time", "part_time", "contract", "temporary", "freelance", "gig", "internship"].map((v) => <option key={v} value={v}>{t[(v === "freelance" ? "freelance_type" : v) as keyof typeof t]}</option>)}
          </select></Field>
        {mode !== "remote" && <>
          <Field e={e} label="City" k="city"><input name="city" list="mk-cities" className={field(e.city)} /><datalist id="mk-cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist></Field>
          <Field e={e} label="State" k="state"><select name="state" className={field()}><option>Andhra Pradesh</option><option>Telangana</option><option>Karnataka</option><option>Tamil Nadu</option><option>Other</option></select></Field>
          <Field e={e} label={`${t.district} (AP / Telangana)`} k="district"><select name="district" defaultValue="" className={field(e.district)}>
            <option value="">—</option>
            {(["AP", "TS"] as const).map((st) => (
              <optgroup key={st} label={st === "AP" ? "Andhra Pradesh" : "Telangana"}>
                {DISTRICTS.filter((d) => d.state === st).sort((a, b) => a.name.localeCompare(b.name)).map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
              </optgroup>
            ))}
          </select></Field>
        </>}
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 t-small font-medium">{t.salary} (₹)</legend>
        <Field e={e} label="Minimum" k="salary_min"><input name="salary_min" type="number" min={0} inputMode="numeric" className={field()} /></Field>
        <Field e={e} label="Maximum" k="salary_max"><input name="salary_max" type="number" min={0} inputMode="numeric" className={field(e.salary_max)} /></Field>
        <Field e={e} label="Per" k="salary_period"><select name="salary_period" className={field()}><option value="monthly">Month</option><option value="yearly">Year</option><option value="daily">Day</option><option value="hourly">Hour</option><option value="project">Project</option></select></Field>
      </fieldset>
      <Field e={e} label={`${t.skills} (comma separated)`} k="skills"><input name="skills" className={field()} placeholder="Tally, Excel, Telugu" /></Field>
      <fieldset className="grid gap-3">
        <legend className="mb-2 t-small font-medium">How should candidates apply?</legend>
        <div className="flex flex-wrap gap-2">
          {[["whatsapp", "WhatsApp"], ["email", "Email"], ["external_url", "Website link"]].map(([v, l]) => (
            <label key={v} className={`flex min-h-11 items-center gap-2 rounded-full border px-4 ${method === v ? "border-ink bg-ink text-paper" : "border-line-strong"}`}>
              <input type="radio" name="application_method" value={v} checked={method === v} onChange={() => setMethod(v)} className="sr-only" />{l}
            </label>
          ))}
        </div>
        {method === "whatsapp" && <Field e={e} label="WhatsApp number" k="apply_whatsapp"><input name="apply_whatsapp" type="tel" inputMode="tel" defaultValue={phone ?? ""} className={field(e.apply_whatsapp)} /></Field>}
        {method === "email" && <Field e={e} label="Email for applications" k="apply_email"><input name="apply_email" type="email" className={field(e.apply_email)} /></Field>}
        {method === "external_url" && <Field e={e} label="Application link" k="apply_url"><input name="apply_url" type="url" placeholder="https://" className={field(e.apply_url)} /></Field>}
      </fieldset>
      <div className="grid gap-2">
        <label className="flex items-start gap-3"><input type="checkbox" name="terms" className="mt-1 h-5 w-5" /><span>I accept the <a href="/terms" className="underline">terms</a> and confirm this is a real job that does not charge candidates any fee.</span></label><Err e={e} k="terms" />
        <label className="flex items-start gap-3"><input type="checkbox" name="privacy" className="mt-1 h-5 w-5" /><span>I accept the <a href="/privacy" className="underline">privacy policy</a>. My mobile number is shared only with the Mana Kosamu review team.</span></label><Err e={e} k="privacy" />
      </div>
      {state && !state.ok && <p role="alert" className="rounded-xl bg-warn-soft p-3 text-warn">{state.message}</p>}
      <button disabled={pending} className="min-h-14 rounded-full bg-ink text-lg font-semibold text-paper disabled:opacity-60">Submit for review</button>
    </form>
  );
}
