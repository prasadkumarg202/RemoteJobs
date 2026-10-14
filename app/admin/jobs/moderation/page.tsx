import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DEMO_MODE } from "@/lib/env";
import { isAdmin, supabaseServer } from "@/lib/supabase/server";
import { moderateJob, resolveReport } from "../actions";

export const metadata: Metadata = { title: "Moderation", robots: { index: false } };
export const dynamic = "force-dynamic";

const FLAG_TEXT: Record<string, string> = {
  payment_required: "Asks candidates to pay", registration_fee: "Mentions a registration/joining fee", training_fee: "Mentions a paid training fee",
  investment_required: "Asks for an investment or purchase", crypto_payment: "Pays in crypto", misleading_income: "Unrealistic income claim",
  task_scam_pattern: "Like/review-to-earn pattern", personal_documents_upfront: "Asks for ID/bank details upfront", telegram_only: "Telegram is the only contact",
  whatsapp_only: "WhatsApp is the only contact", phone_only: "Phone is the only contact", messaging_apps_only: "Only messaging apps", suspicious_domain: "Link shortener or risky domain",
  invalid_apply_url: "Broken application link", free_email_domain: "Company uses a free email address", misleading_salary: "Salary looks implausible",
  expired: "Already expired", duplicate: "Duplicate of a live job", company_unknown: "Company not named", thin_description: "Very short description",
  eligibility_conflict: "Says worldwide but description restricts location",
};

export default async function ModerationPage() {
  if (DEMO_MODE) return <p className="mx-auto max-w-3xl px-4 pt-10">Moderation needs Supabase to be connected.</p>;
  if (!(await isAdmin())) notFound();
  const sb = (await supabaseServer())!;
  const [{ data: pending }, { data: flagged }, { data: reports }] = await Promise.all([
    sb.from("jobs").select("id,slug,title,company_name,source_name,risk_level,risk_score,risk_flags,created_at,application_method,apply_email,apply_whatsapp,apply_url,short_description, job_submission_contacts(contact_name,contact_phone)").eq("moderation_status", "pending").order("risk_score", { ascending: false }).limit(50),
    sb.from("jobs").select("id,slug,title,company_name,source_name,risk_flags,risk_score").eq("moderation_status", "approved").eq("is_active", true).eq("risk_level", "medium").order("risk_score", { ascending: false }).limit(30),
    sb.from("job_reports").select("id,reason,details,created_at,jobs(id,slug,title,company_name)").eq("status", "open").order("created_at", { ascending: false }).limit(50),
  ]);
  const btn = "min-h-10 rounded-full px-4 t-small font-medium";
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6">
      <Link href="/admin/jobs" className="t-small text-ink-soft">← Jobs admin</Link>
      <h1 className="t-h1 mt-2">Moderation</h1>
      <p className="mt-2 max-w-[65ch] t-small text-ink-soft">Flags are automated hints, not verdicts. Public pages say “Needs verification”, never “scam”. Approve only when the job is genuine and free for candidates.</p>

      <section className="mt-8">
        <h2 className="t-h2">Waiting for review ({pending?.length ?? 0})</h2>
        <ul className="mt-3 grid gap-3">
          {(pending ?? []).map((j) => {
            const contact = (j as unknown as { job_submission_contacts: { contact_name: string; contact_phone: string } | null }).job_submission_contacts;
            return (
              <li key={j.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="t-h3">{j.title}</p><p className="t-small text-ink-soft">{j.company_name}, via {j.source_name}</p></div>
                  <span className={`rounded-full px-2.5 py-1 t-tiny ${j.risk_level === "high" ? "bg-warn-soft text-warn" : j.risk_level === "medium" ? "bg-turmeric-soft text-turmeric-ink" : "bg-leaf-soft text-leaf"}`}>Risk {j.risk_level} ({j.risk_score})</span>
                </div>
                <p className="mt-2 t-small">{j.short_description}</p>
                {j.risk_flags?.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{j.risk_flags.map((f: string) => <li key={f} className="rounded-md bg-warn-soft px-2 py-0.5 t-tiny text-warn">{FLAG_TEXT[f] ?? f}</li>)}</ul>}
                <p className="mt-2 t-tiny text-ink-faint">Apply via {j.application_method}{j.apply_email ? `: ${j.apply_email}` : ""}{j.apply_whatsapp ? `: ${j.apply_whatsapp}` : ""}{contact ? `. Submitted by ${contact.contact_name}, ${contact.contact_phone}` : ""}</p>
                <form action={moderateJob} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={j.id} />
                  <input name="note" placeholder="Note (optional)" className="min-h-10 flex-1 rounded-lg border border-line-strong bg-surface px-3 t-small" />
                  <label className="flex items-center gap-1 t-small"><input type="checkbox" name="verified" /> Verified employer</label>
                  <button name="decision" value="approve" className={`${btn} bg-leaf text-white`}>Approve</button>
                  <button name="decision" value="reject" className={`${btn} border border-line-strong`}>Reject</button>
                </form>
              </li>
            );
          })}
          {!pending?.length && <li className="text-ink-soft">Nothing waiting.</li>}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="t-h2">Open reports ({reports?.length ?? 0})</h2>
        <ul className="mt-3 grid gap-2">
          {(reports ?? []).map((r) => {
            const job = (r as unknown as { jobs: { slug: string; title: string; company_name: string } | null }).jobs;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{job ? <Link href={`/jobs/${job.slug}`} className="underline">{job.title}</Link> : "Deleted job"} <span className="font-normal text-ink-soft">{job?.company_name}</span></p>
                  <p className="t-small">{r.reason}{r.details ? `: ${r.details}` : ""}</p>
                </div>
                <form action={resolveReport} className="flex gap-2"><input type="hidden" name="id" value={r.id} />
                  <button name="status" value="reviewed" className={`${btn} bg-ink text-paper`}>Reviewed</button>
                  <button name="status" value="dismissed" className={`${btn} border border-line-strong`}>Dismiss</button></form>
              </li>
            );
          })}
          {!reports?.length && <li className="text-ink-soft">No open reports.</li>}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="t-h2">Live but showing “Needs verification” ({flagged?.length ?? 0})</h2>
        <ul className="mt-3 grid gap-2">
          {(flagged ?? []).map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
              <div className="min-w-0 flex-1"><Link href={`/jobs/${j.slug}`} className="font-semibold underline">{j.title}</Link><p className="t-small text-ink-soft">{j.company_name}, via {j.source_name}: {j.risk_flags.map((f: string) => FLAG_TEXT[f] ?? f).join("; ")}</p></div>
              <form action={moderateJob}><input type="hidden" name="id" value={j.id} /><button name="decision" value="reject" className={`${btn} border border-line-strong`}>Take down</button></form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
