"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { track } from "@/lib/client/track";
import { useI18n } from "./I18nProvider";

/** The prominent "🇮🇳 Remote jobs available in India" switch. */
export function IndiaToggle({ defaultMode = "any" }: { defaultMode?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const current = sp.get("india") ?? defaultMode;
  const options = [
    { v: "india_only", label: t.indiaOnly },
    { v: "india_apac", label: t.indiaApac },
    { v: "worldwide", label: t.worldwide },
    { v: "any", label: t.anyRemote },
  ];
  const set = (v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v === defaultMode) next.delete("india"); else next.set("india", v);
    next.delete("page");
    track("filter_used", { filters: { india: v } });
    router.push(`${path}${next.toString() ? `?${next}` : ""}`, { scroll: false });
  };
  return (
    <fieldset className="rounded-2xl border border-line bg-surface p-3">
      <legend className="sr-only">{t.indiaFilterTitle}</legend>
      <p className="mb-2 flex items-center gap-2 t-small font-semibold" aria-hidden><span>🇮🇳</span>{t.indiaFilterTitle}</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {options.map((o) => (
          <button key={o.v} type="button" onClick={() => set(o.v)} aria-pressed={current === o.v}
            className={`min-h-11 rounded-xl px-3 t-small font-medium ${current === o.v ? "bg-leaf text-white" : "bg-paper text-ink-soft hover:text-ink"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
