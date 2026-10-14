"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AI_PAGE_SUBCATEGORIES, CATEGORIES, GROUPS } from "@engine/taxonomy.ts";
import { COUNTRIES } from "@engine/geo.ts";
import { FILTER_KEYS } from "@/lib/jobs/filters";
import { track } from "@/lib/client/track";
import type { Dict } from "@/lib/i18n";
import { useI18n } from "./I18nProvider";
import { IconClose, IconFilter } from "./icons";

export type FilterGroup =
  | "country" | "region" | "category" | "skill" | "aiCategory" | "experience" | "salary"
  | "type" | "budget" | "duration" | "posted" | "mode" | "sort";

interface Option { v: string; label: string }
interface GroupDef { key: string; title: string; multi: boolean; options: Option[] }

function groupDefs(t: Dict, lang: "en" | "te"): Record<FilterGroup, GroupDef> {
  const name = (c: { name: string; name_te: string }) => (lang === "te" ? c.name_te : c.name);
  const POPULAR_COUNTRIES = ["IN", "US", "GB", "CA", "DE", "AE", "SG", "AU"];
  return {
    country: { key: "country", title: t.country, multi: false, options: POPULAR_COUNTRIES.map((c) => ({ v: c, label: COUNTRIES[c].name })) },
    region: { key: "region", title: t.region, multi: true, options: [
      { v: "worldwide", label: t.worldwide }, { v: "apac", label: "APAC" }, { v: "asia", label: "Asia" },
      { v: "europe", label: "Europe" }, { v: "north_america", label: "North America" }, { v: "emea", label: "EMEA" }, { v: "latam", label: "LATAM" },
    ] },
    category: { key: "cat", title: t.category, multi: true, options: [
      ...GROUPS.map((g) => ({ v: g.slug, label: name(g) })),
      ...CATEGORIES.filter((c) => c.kind === "field" && !c.ai).map((c) => ({ v: c.slug, label: name(c) })),
    ] },
    skill: { key: "cat", title: t.skill, multi: true, options: CATEGORIES.filter((c) => c.kind === "skill").map((c) => ({ v: c.slug, label: name(c) })) },
    aiCategory: { key: "ai", title: t.aiCategory, multi: true, options: [...AI_PAGE_SUBCATEGORIES, "nlp", "deep-learning", "ai-image-generation", "ai-video"].map((s) => ({ v: s, label: name(CATEGORIES.find((c) => c.slug === s)!) })) },
    experience: { key: "level", title: t.experience, multi: true, options: [
      { v: "entry", label: t.entry }, { v: "mid", label: t.mid }, { v: "senior", label: t.senior }, { v: "lead", label: t.lead },
    ] },
    salary: { key: "salary", title: t.salaryFilter, multi: false, options: [
      { v: "3", label: "₹3L+" }, { v: "6", label: "₹6L+" }, { v: "10", label: "₹10L+" }, { v: "20", label: "₹20L+" }, { v: "40", label: "₹40L+" },
    ] },
    type: { key: "type", title: t.employmentType, multi: true, options: ["full_time", "part_time", "contract", "freelance", "gig", "internship", "temporary"].map((v) => ({ v, label: t[(v === "freelance" ? "freelance_type" : v) as keyof Dict] as string })) },
    budget: { key: "budget", title: t.budget, multi: true, options: [{ v: "fixed_price", label: t.fixed_price }, { v: "hourly", label: t.hourly }, { v: "monthly", label: t.monthly }] },
    duration: { key: "dur", title: t.duration, multi: true, options: ["one_time", "less_than_1_month", "1_to_3_months", "3_to_6_months", "6_plus_months", "ongoing"].map((v) => ({ v, label: t[v as keyof Dict] as string })) },
    posted: { key: "posted", title: t.postedDate, multi: false, options: [{ v: "1", label: t.last24h }, { v: "3", label: t.last3d }, { v: "7", label: t.last7d }, { v: "30", label: t.last30d }] },
    mode: { key: "mode", title: t.workMode, multi: true, options: [{ v: "onsite", label: "On-site" }, { v: "hybrid", label: "Hybrid" }, { v: "remote", label: t.remote }] },
    sort: { key: "sort", title: t.sortBy, multi: false, options: [{ v: "relevance", label: t.sortRelevance }, { v: "newest", label: t.sortNewest }, { v: "salary", label: t.sortSalary }] },
  };
}

type State = Record<string, string[]>;

function readState(sp: URLSearchParams): State {
  const s: State = {};
  for (const k of FILTER_KEYS) {
    const v = sp.get(k);
    if (v) s[k] = v.split(",").filter(Boolean);
  }
  return s;
}

function GroupFields({ def, state, onChange }: { def: GroupDef; state: State; onChange: (key: string, values: string[]) => void }) {
  const selected = state[def.key] ?? [];
  const toggle = (v: string) => {
    if (def.multi) onChange(def.key, selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    else onChange(def.key, selected[0] === v ? [] : [v]);
  };
  return (
    <div role="group" aria-label={def.title} className="border-t border-line py-4 first:border-t-0">
      <p className="mb-2 t-small font-semibold">{def.title}</p>
      <div className="flex flex-wrap gap-1.5">
        {def.options.map((o) => {
          const on = selected.includes(o.v);
          return (
            <button key={o.v} type="button" onClick={() => toggle(o.v)} aria-pressed={on}
              className={`min-h-10 rounded-full border px-3 t-small t-condensed ${on ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink-soft hover:border-ink-faint"}`}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Filters: a bottom sheet on phones (sticky trigger), a sidebar on desktop.
 * The sheet stages changes and applies them with one tap; the sidebar applies immediately.
 */
export function FilterPanel({ groups, total }: { groups: FilterGroup[]; total: number }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const defs = groupDefs(t, lang);
  const [open, setOpen] = useState(false);
  const [staged, setStaged] = useState<State>(() => readState(sp));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const active = Object.entries(readState(sp)).filter(([k]) => k !== "sort" && k !== "india").length;

  useEffect(() => setStaged(readState(sp)), [sp]);
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const push = (state: State) => {
    const next = new URLSearchParams(sp.toString());
    for (const k of FILTER_KEYS) if (k !== "india" && k !== "sort") next.delete(k);
    for (const [k, v] of Object.entries(state)) if (v.length && k !== "india" && k !== "sort") next.set(k, v.join(","));
    next.delete("page");
    track("filter_used", { filters: Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v.join(",")])) });
    const q = next.toString();
    router.push(q ? `${path}?${q}` : path, { scroll: false });
  };

  const listed = groups.filter((g) => g !== "sort");

  return (
    <>
      {/* Phone: sticky bar with the sheet trigger */}
      <div className="sticky top-0 z-20 -mx-4 flex items-center gap-2 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur md:hidden">
        <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-medium">
          <IconFilter /> {t.filters}{active ? <span className="grid h-6 min-w-6 place-items-center rounded-full bg-ink px-1.5 t-tiny text-paper">{active}</span> : null}
        </button>
        <SortSelect />
        <span className="ml-auto t-small text-ink-faint">{total.toLocaleString("en-IN")}</span>
      </div>

      <dialog ref={dialogRef} onClose={() => setOpen(false)} aria-label={t.filters}
        className="m-0 mt-auto h-[85dvh] max-h-none w-full max-w-none rounded-t-3xl bg-surface p-0 text-ink backdrop:bg-ink/40 md:hidden">
        <div className="sheet-in flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="t-h3">{t.filters}</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label={t.close} className="grid h-11 w-11 place-items-center rounded-full"><IconClose /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4">
            {listed.map((g) => <GroupFields key={g} def={defs[g]} state={staged} onChange={(k, v) => setStaged((s) => ({ ...s, [k]: v }))} />)}
          </div>
          <div className="flex gap-2 border-t border-line p-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
            <button type="button" onClick={() => setStaged({})} className="min-h-12 flex-1 rounded-full border border-line-strong font-medium">{t.clearAll}</button>
            <button type="button" onClick={() => { push(staged); setOpen(false); }} className="min-h-12 flex-[2] rounded-full bg-ink font-semibold text-paper">{t.applyFilters}</button>
          </div>
        </div>
      </dialog>

      {/* Desktop sidebar */}
      <aside className="hidden md:block" aria-label={t.filters}>
        <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-line bg-surface px-4 py-1">
          <div className="flex items-center justify-between border-b border-line pb-1 pt-3">
            <h2 className="t-h3">{t.filters}</h2>
            {active > 0 && <button type="button" onClick={() => { setStaged({}); push({}); }} className="t-small text-ink-soft underline underline-offset-4">{t.clearAll}</button>}
          </div>
          {listed.map((g) => <GroupFields key={g} def={defs[g]} state={staged} onChange={(k, v) => { const s = { ...staged, [k]: v }; setStaged(s); push(s); }} />)}
        </div>
      </aside>
    </>
  );
}

export function SortSelect() {
  const { t } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <label className="inline-flex items-center gap-2 t-small text-ink-soft">
      <span className="sr-only md:not-sr-only">{t.sortBy}</span>
      <select value={sp.get("sort") ?? ""} onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        if (e.target.value) next.set("sort", e.target.value); else next.delete("sort");
        next.delete("page");
        const q = next.toString();
        router.push(q ? `${path}?${q}` : path, { scroll: false });
      }} className="min-h-11 rounded-full border border-line-strong bg-surface px-3 text-ink">
        <option value="">{t.sortRelevance}</option>
        <option value="newest">{t.sortNewest}</option>
        <option value="salary">{t.sortSalary}</option>
      </select>
    </label>
  );
}
