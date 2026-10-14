// Salary & budget parsing, validation, INR conversion and display.
// The original salary is always preserved; INR is an approximate convenience.

import type { BudgetType, EmploymentType, ExchangeRates, SalaryPeriod } from "./types.ts";

export interface SalaryInfo {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: SalaryPeriod | null;
  /** Problems found while validating (feeds the risk checker). */
  issues: string[];
}

const SYMBOLS: Array<[RegExp, string]> = [
  [/₹|\bINR\b|\bRs\.?(?=\s?\d)|\brupees?\b/i, "INR"],
  [/€|\bEUR\b/i, "EUR"],
  [/£|\bGBP\b/i, "GBP"],
  [/\bC\$|\bCAD\b/i, "CAD"],
  [/\bA\$|\bAUD\b/i, "AUD"],
  [/\bS\$|\bSGD\b/i, "SGD"],
  [/\bAED\b/i, "AED"],
  [/\$|\bUSD\b/i, "USD"],
];

export function normalizePeriod(raw: string | null | undefined): SalaryPeriod | null {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (/hour|hr\b|\/h\b|hourly/.test(r)) return "hourly";
  if (/day|daily/.test(r)) return "daily";
  if (/fortnight|week/.test(r)) return "weekly";
  if (/month|\bmo\b|\/m\b|\bp\.?m\.?$|per mensem/.test(r)) return "monthly";
  if (/year|annual|annum|\byr\b|\/y\b|\bp\.?a\.?\b|lpa|ctc/.test(r)) return "yearly";
  if (/project|fixed|one[- ]time|total|budget/.test(r)) return "project";
  return null;
}

function parseAmount(numStr: string, suffix: string | undefined): number {
  const n = Number(numStr.replace(/,/g, ""));
  const s = (suffix ?? "").toLowerCase();
  if (s === "k") return n * 1_000;
  if (s === "m" || s === "mn") return n * 1_000_000;
  if (s === "l" || s === "lakh" || s === "lakhs" || s === "lac" || s === "lpa") return n * 100_000;
  if (s === "cr" || s === "crore") return n * 10_000_000;
  return n;
}

/** Parse free text like "$80,000 – $120,000/year", "USD 80k-120k", "₹5,000–₹15,000", "$20-$40/hr", "8-12 LPA". */
export function parseSalaryText(text: string | null | undefined): SalaryInfo | null {
  if (!text) return null;
  const t = text.replace(/ | /g, " ");
  const num = String.raw`(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s*(k|K|m|M|mn|L|l|lakhs?|lac|lpa|LPA|cr|crore)?`;
  const re = new RegExp(String.raw`(?:[₹€£$]|INR|USD|EUR|GBP|CAD|AUD|Rs\.?)?\s*${num}\s*(?:-|–|—|to)\s*(?:[₹€£$]|INR|USD|EUR|GBP|CAD|AUD|Rs\.?)?\s*${num}`, "i");
  const single = new RegExp(String.raw`(?:[₹€£$]|INR|USD|EUR|GBP|CAD|AUD|Rs\.?)\s*${num}|${num}\s*(?:INR|USD|EUR|GBP|LPA)`, "i");
  let min: number | null = null;
  let max: number | null = null;
  const m = t.match(re);
  if (m) {
    // "80-120k" / "8-12 LPA" → the trailing unit applies to both numbers
    min = parseAmount(m[1], m[2] ?? m[4]);
    max = parseAmount(m[3], m[4] ?? m[2]);
  } else {
    const s = t.match(single);
    if (!s) return null;
    const v = s[1] ? parseAmount(s[1], s[2]) : parseAmount(s[3], s[4]);
    min = v;
    max = v;
  }
  let currency: string | null = null;
  for (const [sym, cur] of SYMBOLS) if (sym.test(t)) { currency = cur; break; }
  if (!currency && /lpa|lakh|crore/i.test(t)) currency = "INR";
  let period = normalizePeriod(t);
  if (!period && /lpa|ctc/i.test(t)) period = "yearly";
  return validateSalary({ min, max, currency, period, issues: [] });
}

/** Typical plausible ranges per period, in USD-equivalent (rough guardrails). */
const PLAUSIBLE_USD: Record<SalaryPeriod, [number, number]> = {
  hourly: [1, 500], daily: [8, 4000], weekly: [40, 20000], monthly: [100, 80000],
  yearly: [1000, 1_500_000], project: [5, 500_000], unknown: [1, 1_500_000],
};

export function validateSalary(s: SalaryInfo, rates?: ExchangeRates): SalaryInfo {
  const issues = [...s.issues];
  let { min, max } = s;
  const clean = (v: number | null) => (v === null || !Number.isFinite(v) || v <= 0 ? null : Math.round(v * 100) / 100);
  min = clean(min);
  max = clean(max);
  if (min === null && max !== null) min = null;
  if (min !== null && max !== null && min > max) { [min, max] = [max, min]; issues.push("salary_swapped"); }
  let period = s.period;
  // Infer a missing period from magnitude (USD-ish sources): 15–250 → hourly, ≥ 20k → yearly.
  if (!period && (min ?? max) !== null) {
    const v = (max ?? min)!;
    const cur = s.currency ?? "USD";
    if (cur !== "INR") period = v <= 250 ? "hourly" : v >= 20000 ? "yearly" : v >= 1500 ? "monthly" : null;
    else period = v >= 300000 ? "yearly" : v >= 8000 ? "monthly" : null;
  }
  if (min !== null || max !== null) {
    const p = period ?? "unknown";
    const usdRate = rates && s.currency && rates[s.currency] && rates.USD ? rates[s.currency] / rates.USD : s.currency === "USD" || !s.currency ? 1 : null;
    if (usdRate) {
      const [lo, hi] = PLAUSIBLE_USD[p];
      const vmax = (max ?? min)! * usdRate;
      const vmin = (min ?? max)! * usdRate;
      if (vmax > hi) issues.push("salary_implausibly_high");
      if (vmin < lo) issues.push("salary_implausibly_low");
    }
    if (min !== null && max !== null && min > 0 && max / min > 10) issues.push("salary_range_too_wide");
  }
  return { min, max, currency: min !== null || max !== null ? (s.currency ?? null) : null, period: min !== null || max !== null ? period : null, issues };
}

export function buildSalary(input: {
  salaryMin?: number | null; salaryMax?: number | null; salaryCurrency?: string | null;
  salaryPeriodRaw?: string | null; salaryText?: string | null;
}, rates?: ExchangeRates): SalaryInfo {
  const hasStructured = (input.salaryMin ?? 0) > 0 || (input.salaryMax ?? 0) > 0;
  if (hasStructured) {
    return validateSalary({
      min: input.salaryMin ?? null,
      max: input.salaryMax ?? input.salaryMin ?? null,
      currency: (input.salaryCurrency || "USD").toUpperCase().slice(0, 3),
      period: normalizePeriod(input.salaryPeriodRaw),
      issues: [],
    }, rates);
  }
  const parsed = parseSalaryText(input.salaryText);
  if (parsed) return validateSalary(parsed, rates);
  return { min: null, max: null, currency: null, period: null, issues: [] };
}

export function toInr(amount: number | null, currency: string | null, rates: ExchangeRates): number | null {
  if (amount === null || !currency) return null;
  if (currency === "INR") return Math.round(amount);
  const r = rates[currency];
  return r ? Math.round(amount * r) : null;
}

const ANNUAL_FACTOR: Record<SalaryPeriod, number | null> = {
  hourly: 2080, daily: 260, weekly: 52, monthly: 12, yearly: 1, project: null, unknown: null,
};

export function annualize(amount: number | null, period: SalaryPeriod | null): number | null {
  if (amount === null || !period) return null;
  const f = ANNUAL_FACTOR[period];
  return f === null ? null : Math.round(amount * f);
}

export function deriveBudget(s: SalaryInfo, employmentType: EmploymentType): {
  budget_type: BudgetType | null; budget_min: number | null; budget_max: number | null;
  budget_currency: string | null; budget_period: SalaryPeriod | null;
} {
  const freelanceLike = employmentType === "freelance" || employmentType === "gig" || employmentType === "contract";
  if (!freelanceLike) return { budget_type: null, budget_min: null, budget_max: null, budget_currency: null, budget_period: null };
  if (s.min === null && s.max === null) {
    return { budget_type: "unknown", budget_min: null, budget_max: null, budget_currency: null, budget_period: null };
  }
  const type: BudgetType = s.period === "hourly" ? "hourly" : s.period === "project" ? "fixed_price" : s.period === "monthly" ? "monthly" : "unknown";
  return { budget_type: type, budget_min: s.min, budget_max: s.max, budget_currency: s.currency, budget_period: s.period };
}

// ── Display ───────────────────────────────────────────────────────────────

const CUR_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", INR: "₹", CAD: "C$", AUD: "A$", SGD: "S$" };
const PERIOD_LABEL: Record<SalaryPeriod, string> = {
  hourly: "/hour", daily: "/day", weekly: "/week", monthly: "/month", yearly: "/year", project: " project", unknown: "",
};

function compact(n: number, currency: string): string {
  if (currency === "INR") {
    if (n >= 10_000_000) return `${trim(n / 10_000_000)}Cr`;
    if (n >= 100_000) return `${trim(n / 100_000)}L`;
    return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 10_000) return `${trim(n / 1000)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 });
}
function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace(/\.0$/, "");
}

export function formatMoneyRange(min: number | null, max: number | null, currency: string | null, period: SalaryPeriod | null): string | null {
  if ((min === null && max === null) || !currency) return null;
  const sym = CUR_SYMBOL[currency] ?? `${currency} `;
  const lo = min ?? max!;
  const hi = max ?? min!;
  const range = lo === hi ? `${sym}${compact(lo, currency)}` : `${sym}${compact(lo, currency)}–${sym}${compact(hi, currency)}`;
  return `${range}${period ? PERIOD_LABEL[period] : ""}`;
}
