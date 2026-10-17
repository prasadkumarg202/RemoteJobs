"use client";
import Link from "next/link";
import { useActionState, useRef } from "react";
import { askJobs, type AskResult } from "@/app/jobs/ask/actions";
import { citedOrder, MAX_QUESTION, parseAnswer } from "@/lib/ai/assistant-core";
import { fmt } from "@/lib/i18n";
import { JobCard } from "./JobCard";
import { useI18n } from "./I18nProvider";
import { IconSpark } from "./icons";

/** Jobs assistant: question box, the AI answer with numbered links, then the jobs it used. */
export function AskJobs({ initial = "" }: { initial?: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<AskResult | null, FormData>(askJobs, null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ask = (q: string) => {
    if (!inputRef.current || !formRef.current) return;
    inputRef.current.value = q;
    formRef.current.requestSubmit();
  };

  const jobs = state?.jobs ?? [];
  const order = state?.answer ? citedOrder(state.answer, jobs.length) : [];
  const shown = [...order, ...jobs.map((_, i) => i + 1).filter((n) => !order.includes(n))];
  const note = state?.note === "quota" ? fmt(t.askQuota, { limit: state.limit ?? "" })
    : state?.note === "off" ? t.askOff : state?.note === "failed" ? t.askFailed : state?.note === "short" ? t.askShort
    : state?.note === "signin" ? t.askSignin : state?.note === "demo" ? t.askDemo : null;

  return (
    <div className="grid gap-5">
      <form ref={formRef} action={action} className="grid gap-3 rounded-2xl border border-line bg-surface p-4">
        <label htmlFor="ask-q" className="sr-only">{t.askTitle}</label>
        <textarea id="ask-q" key={state?.question ?? "first"} ref={inputRef} name="q" rows={2} maxLength={MAX_QUESTION} required defaultValue={state?.question ?? initial} placeholder={t.askPlaceholder}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); formRef.current?.requestSubmit(); } }}
          className="min-h-20 w-full resize-y rounded-xl border border-line-strong bg-paper px-4 py-3 text-lg focus:border-ink focus:outline-none" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {[t.askEx1, t.askEx2, t.askEx3].map((ex) => (
              <button key={ex} type="button" disabled={pending} onClick={() => ask(ex)}
                className="min-h-9 rounded-full border border-line px-3 t-small text-ink-soft hover:border-ink hover:text-ink disabled:opacity-50">{ex}</button>
            ))}
          </div>
          <button disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-paper disabled:opacity-60">
            <IconSpark className="h-4 w-4" />{pending ? t.askThinking : t.askButton}
          </button>
        </div>
      </form>

      <div aria-live="polite" className="grid gap-5">
        {pending && <p className="animate-pulse rounded-2xl border border-line bg-surface p-5 text-ink-soft">{t.askThinking}</p>}
        {!pending && state && (
          <>
            {state.answer && (
              <section className="rounded-2xl border border-line bg-surface p-5" aria-label={t.askTitle}>
                <p className="mb-2 t-tiny text-ink-faint">“{state.question}”</p>
                <div className="whitespace-pre-line leading-relaxed" lang={state.lang}>
                  {parseAnswer(state.answer, jobs.length).map((p, i) => "ref" in p
                    ? <Link key={i} href={`/jobs/${jobs[p.ref - 1].slug}`} title={jobs[p.ref - 1].title}
                        className="mx-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-leaf px-1.5 align-middle t-tiny font-semibold text-white no-underline">{p.ref}</Link>
                    : <span key={i}>{p.text}</span>)}
                </div>
                <p className="mt-4 t-tiny text-ink-faint">{t.askDisclaimer}{state.limit ? ` · ${fmt(t.askUsage, { used: state.used ?? 0, limit: state.limit })}` : ""}</p>
              </section>
            )}
            {note && <p role="status" className="rounded-xl bg-turmeric-soft p-3 t-small text-turmeric-ink">{note}</p>}
            {jobs.length > 0 ? (
              <section aria-label={state.answer ? t.askJobsUsed : t.askMatching}>
                <h2 className="t-h3">{state.answer ? t.askJobsUsed : t.askMatching}</h2>
                <ol className="mt-3 grid gap-3">
                  {shown.map((n) => (
                    <li key={jobs[n - 1].id} className="flex items-start gap-2">
                      {state.answer && <span className="mt-4 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-leaf px-1.5 t-tiny font-semibold text-white">{n}</span>}
                      <div className="w-full min-w-0"><JobCard job={jobs[n - 1]} t={t} /></div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : state.note !== "short" && state.note !== "signin" && state.note !== "quota" && (
              <p className="rounded-2xl border border-dashed border-line-strong bg-surface p-5 text-ink-soft">{t.askNoneFound}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
