"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "./I18nProvider";
import { IconSearch } from "./icons";

const EXAMPLES = ["AI jobs remote", "ChatGPT", "n8n freelancer", "Python remote India", "SQL DBA remote", "data entry work from home", "video editing freelance"];

export function SearchBar({ defaultValue = "", size = "lg", showExamples = false, action = "/jobs/search", placeholder }: { defaultValue?: string; size?: "lg" | "md"; showExamples?: boolean; action?: string; placeholder?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState(defaultValue);
  const go = (value: string) => router.push(value.trim() ? `${action}?q=${encodeURIComponent(value.trim())}` : action);
  return (
    <div>
      <form role="search" onSubmit={(e) => { e.preventDefault(); go(q); }} className="relative">
        <label htmlFor="job-search" className="sr-only">{t.searchPlaceholder}</label>
        <IconSearch className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint ${size === "lg" ? "h-6 w-6" : "h-5 w-5"}`} />
        <input id="job-search" type="search" inputMode="search" enterKeyHint="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder ?? t.searchPlaceholder}
          className={`w-full rounded-2xl border border-line-strong bg-surface pr-28 text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none ${size === "lg" ? "min-h-16 pl-13 text-lg" : "min-h-12 pl-11"}`} />
        <button type="submit" className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-ink px-5 font-medium text-paper ${size === "lg" ? "min-h-12" : "min-h-9"}`}>{t.search}</button>
      </form>
      {showExamples && (
        <ul className="scroll-x mt-3 flex gap-2 md:flex-wrap" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <li key={ex} className="shrink-0">
              <button type="button" onClick={() => go(ex)} className="min-h-9 rounded-full border border-line bg-surface px-3 t-small text-ink-soft hover:border-ink hover:text-ink">{ex}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
