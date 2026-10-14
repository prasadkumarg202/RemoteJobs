"use client";
import { useActionState, useState } from "react";
import { CATEGORIES, GROUPS } from "@engine/taxonomy.ts";
import { createAlert } from "@/app/jobs/alerts/actions";
import { useI18n } from "./I18nProvider";

export function AlertForm() {
  const { t, lang } = useI18n();
  const [state, action, pending] = useActionState(createAlert, null);
  const [preset, setPreset] = useState(false);
  const field = "min-h-12 w-full rounded-xl border border-line-strong bg-surface px-3";
  const check = "flex min-h-11 items-center gap-2";
  return (
    <form action={action} className="grid gap-4 rounded-2xl border border-line bg-surface p-5" key={preset ? "preset" : "blank"}>
      <button type="button" onClick={() => setPreset(true)} className="justify-self-start rounded-full border border-leaf bg-leaf-soft px-4 py-2 t-small font-medium text-leaf">
        🇮🇳 {t.alertExample}
      </button>
      <label className="grid gap-1.5"><span className="t-small font-medium">Name</span>
        <input name="name" className={field} defaultValue={preset ? "India-eligible remote AI jobs" : ""} placeholder="e.g. Python remote jobs" /></label>
      <label className="grid gap-1.5"><span className="t-small font-medium">Keywords</span>
        <input name="keywords" className={field} placeholder="python, n8n, data entry" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5"><span className="t-small font-medium">{t.category}</span>
          <select name="category" className={field} defaultValue="">
            <option value="">—</option>
            {GROUPS.map((g) => <option key={g.slug} value={g.slug}>{lang === "te" ? g.name_te : g.name}</option>)}
            {CATEGORIES.filter((c) => c.kind === "field").map((c) => <option key={c.slug} value={c.slug}>{lang === "te" ? c.name_te : c.name}</option>)}
          </select></label>
        <label className="grid gap-1.5"><span className="t-small font-medium">{t.indiaFilterTitle}</span>
          <select name="india_mode" className={field} defaultValue={preset ? "eligible" : ""}>
            <option value="">{t.anyRemote}</option>
            <option value="eligible">{t.indiaEligible}</option>
            <option value="india_only">{t.indiaOnly}</option>
            <option value="india_apac">{t.indiaApac}</option>
            <option value="worldwide">{t.worldwide}</option>
          </select></label>
        <label className="grid gap-1.5"><span className="t-small font-medium">{t.country} (ISO, optional)</span>
          <input name="country" className={field} maxLength={2} placeholder="IN" /></label>
        <label className="grid gap-1.5"><span className="t-small font-medium">Minimum salary (₹ lakh / year)</span>
          <input name="salary_lakh" type="number" min={0} step={1} className={field} /></label>
      </div>
      <fieldset className="flex flex-wrap gap-x-5">
        <legend className="mb-1 t-small font-medium">Only</legend>
        <label className={check}><input type="checkbox" name="remote_only" defaultChecked={preset} className="h-5 w-5" /> {t.remote}</label>
        <label className={check}><input type="checkbox" name="ai_only" defaultChecked={preset} className="h-5 w-5" /> AI</label>
        <label className={check}><input type="checkbox" name="freelance_only" className="h-5 w-5" /> {t.freelanceShort}</label>
      </fieldset>
      <fieldset className="flex flex-wrap gap-x-5">
        <legend className="mb-1 t-small font-medium">{t.employmentType}</legend>
        {["full_time", "part_time", "contract", "freelance", "gig", "internship"].map((v) => (
          <label key={v} className={check}><input type="checkbox" name="employment_types" value={v} className="h-5 w-5" /> {t[(v === "freelance" ? "freelance_type" : v) as keyof typeof t]}</label>
        ))}
      </fieldset>
      <p className="t-small text-ink-faint">You’ll get matches as in-app notifications. Email and WhatsApp alerts are coming later.</p>
      <button disabled={pending} className="min-h-12 rounded-full bg-ink font-semibold text-paper disabled:opacity-60">{t.createAlert}</button>
      {state && <p role="status" className={`rounded-xl p-3 t-small ${state.ok ? "bg-leaf-soft text-leaf" : "bg-warn-soft text-warn"}`}>{state.message}</p>}
    </form>
  );
}
