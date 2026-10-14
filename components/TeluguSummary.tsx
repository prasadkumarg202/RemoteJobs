"use client";
import { useState } from "react";
import { useI18n } from "./I18nProvider";

/** Optional: concise Telugu explanation generated server-side. Never replaces the original text. */
export function TeluguSummary({ jobId }: { jobId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "unavailable"; text?: string }>({ status: "idle" });
  const load = async () => {
    setState({ status: "loading" });
    const res = await fetch(`/api/jobs/${jobId}/telugu-summary`, { method: "POST" });
    if (!res.ok) return setState({ status: "unavailable" });
    const data = await res.json();
    setState({ status: "done", text: data.summary });
  };
  if (state.status === "done") {
    return (
      <section lang="te" className="rounded-2xl border border-turmeric bg-turmeric-soft p-4">
        <p className="t-small font-semibold text-turmeric-ink">{t.aiSummary}</p>
        <p className="mt-2 whitespace-pre-line leading-relaxed">{state.text}</p>
        <p className="mt-3 t-tiny text-turmeric-ink">{t.aiSummaryNote}</p>
      </section>
    );
  }
  return (
    <div>
      <button type="button" onClick={load} disabled={state.status === "loading"} lang="te"
        className="inline-flex min-h-12 items-center rounded-full border border-turmeric bg-turmeric-soft px-5 font-medium text-turmeric-ink">
        {state.status === "loading" ? "…" : t.teluguExplain}
      </button>
      {state.status === "unavailable" && <p className="mt-2 t-small text-ink-faint">{t.teluguUnavailable}</p>}
    </div>
  );
}
