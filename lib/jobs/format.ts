import { DISTRICT_BY_SLUG } from "@engine/districts.ts";
import { countryName, formatMoneyRange, regionName } from "@engine";
import { fmt, type Dict } from "@/lib/i18n";
import type { JobCard } from "./types";

export function postedAgo(iso: string, t: Dict, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return t.postedToday;
  if (hours < 24) return new Date(iso).toDateString() === new Date(now).toDateString() ? (hours <= 1 ? t.postedToday : fmt(t.postedHours, { n: hours })) : t.postedYesterday;
  const days = Math.floor(diff / 86400000);
  if (days <= 1) return t.postedYesterday;
  return fmt(t.postedDays, { n: days });
}

export type EligTone = "open" | "partial" | "closed" | "unknown";

/** The single most important fact for an Indian candidate: can I apply? */
export function indiaEligibility(j: Pick<JobCard, "india_eligibility" | "work_mode" | "eligible_regions" | "timezone_requirements">, t: Dict): { label: string; tone: EligTone } {
  switch (j.india_eligibility) {
    case "explicit": return { label: t.indiaEligible, tone: "open" };
    case "worldwide": return { label: t.indiaEligible, tone: "open" };
    case "region": return { label: j.eligible_regions.includes("apac") ? t.apacEligible : t.indiaEligible, tone: "partial" };
    case "timezone": return { label: t.istFriendly, tone: "partial" };
    case "not_eligible": return { label: t.notForIndia, tone: "closed" };
    default: return { label: t.eligibilityUnknown, tone: "unknown" };
  }
}

/** "Remote — United States only", "Remote — Worldwide", "Hyderabad (Hybrid)". */
export function whereLabel(j: Pick<JobCard, "work_mode" | "eligibility_type" | "eligible_countries" | "eligible_regions" | "timezone_requirements" | "city" | "state" | "district"> & { sections?: string[] }, t: Dict): string {
  if (j.work_mode === "remote") {
    if (j.eligibility_type === "worldwide") return `${t.remote}, ${t.worldwide.toLowerCase()}`;
    const places = [...j.eligible_countries.map(countryName), ...j.eligible_regions.map(regionName)];
    if (places.length) return `${t.remote}: ${places.slice(0, 3).join(", ")}${places.length > 3 ? ` +${places.length - 3}` : ""}`;
    if (j.timezone_requirements.length) return `${t.remote}: ${j.timezone_requirements[0]}${j.timezone_requirements.length > 1 ? ` – ${j.timezone_requirements.at(-1)}` : ""}`;
    return t.remote;
  }
  const dist = j.district ? DISTRICT_BY_SLUG[j.district] : null;
  const town = j.city ?? (dist ? `${dist.name} district` : null);
  if (j.sections?.includes("government")) return [town, j.state].filter(Boolean).join(", ") || t.allIndia;
  const place = [town, j.state].filter(Boolean).join(", ");
  const mode = j.work_mode === "hybrid" ? "Hybrid" : "On-site";
  return place ? `${place} (${mode})` : mode;
}

export function payLabel(j: JobCard): { original: string | null; inr: string | null } {
  const useBudget = j.budget_min !== null || j.budget_max !== null;
  const min = useBudget ? j.budget_min : j.salary_min;
  const max = useBudget ? j.budget_max : j.salary_max;
  const cur = useBudget ? j.budget_currency : j.salary_currency;
  const period = useBudget ? j.budget_period : j.salary_period;
  const original = formatMoneyRange(min, max, cur, period);
  const inr = cur && cur !== "INR" && original ? formatMoneyRange(j.salary_inr_min, j.salary_inr_max, "INR", period) : null;
  return { original, inr: inr ? `≈ ${inr}` : null };
}

export function typeLabel(type: string, t: Dict): string {
  const key = (type === "freelance" ? "freelance_type" : type) as keyof Dict;
  return t[key] ?? type;
}

export function experienceLabel(j: Pick<JobCard, "experience_min" | "experience_max" | "seniority">, t: Dict): string | null {
  const level = j.seniority !== "any" ? (t[j.seniority as keyof Dict] as string) : null;
  if (j.experience_min !== null) {
    const yrs = j.experience_max ? `${j.experience_min}–${j.experience_max} yrs` : j.experience_min === 0 ? "0–1 yrs" : `${j.experience_min}+ yrs`;
    return level ? `${level} · ${yrs}` : yrs;
  }
  return level;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}
