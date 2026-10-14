// Remote-work eligibility. "Remote" never automatically means "worldwide":
// India eligibility is only granted when the source data supports it.

import { COUNTRIES, INDIAN_CITIES, REGIONS, countryCode, findCountries, findRegions, regionName } from "./geo.ts";
import type { EligibilityType, IndiaEligibility, WorkMode } from "./types.ts";

export interface EligibilityInput {
  title: string;
  description: string;
  locationRaw?: string | null;
  countriesRaw?: string[] | null;
  timezonesRaw?: Array<string | number> | null;
  workModeHint?: WorkMode | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface EligibilityResult {
  work_mode: WorkMode;
  remote_allowed: boolean;
  remote_worldwide: boolean;
  eligibility_type: EligibilityType;
  eligible_countries: string[];
  eligible_regions: string[];
  india_eligibility: IndiaEligibility;
  timezone_requirements: string[];
  timezone: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  region: string | null;
  location_text: string | null;
  /** Description contradicted a "worldwide" label. */
  restriction_conflict: boolean;
}

const TZ_ABBR: Record<string, number> = {
  PST: -8, PDT: -7, PT: -8, MST: -7, MDT: -6, MT: -7, CST: -6, CDT: -5, CT: -6, EST: -5, EDT: -4, ET: -5,
  GMT: 0, UTC: 0, BST: 1, WET: 0, CET: 1, CEST: 2, EET: 2, EEST: 3, IST: 5.5, SGT: 8, AEST: 10, AEDT: 11, JST: 9,
};

export function parseTimezone(v: string | number): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= -12 && v <= 14 ? v : null;
  const s = v.trim().toUpperCase();
  const m = s.match(/^(?:UTC|GMT)?\s*([+-−])\s*(\d{1,2})(?::?(\d{2}))?$/);
  if (m) {
    const sign = m[1] === "+" ? 1 : -1;
    const val = sign * (Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0));
    return val >= -12 && val <= 14 ? val : null;
  }
  if (s in TZ_ABBR) return TZ_ABBR[s];
  if (/^(UTC|GMT)$/.test(s)) return 0;
  return null;
}

export function formatOffset(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  const a = Math.abs(n);
  const h = Math.floor(a);
  const m = Math.round((a - h) * 60);
  return `UTC${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

// Restrictive phrases in descriptions. Each capture group is scanned for countries/regions.
const RESTRICTION_PATTERNS: RegExp[] = [
  /(?:must|should|need to|required to)\s+(?:be\s+)?(?:currently\s+)?(?:located|based|residing|reside|living|live)\s+(?:in|within)\s+(?:the\s+)?([^.;\n]{2,80})/gi,
  /(?:only|exclusively)\s+(?:open|available|accepting(?:\s+applications)?)\s+(?:to|from)\s+(?:candidates|applicants|residents|people)?\s*(?:based|located|living)?\s*(?:in|from|of)?\s*(?:the\s+)?([^.;\n]{2,80})/gi,
  /(?:candidates|applicants)\s+(?:must\s+be\s+)?(?:based|located)\s+in\s+(?:the\s+)?([^.;\n]{2,60})\s+only/gi,
  /(?:legally\s+)?(?:authori[sz]ed|eligible)\s+to\s+work\s+in\s+(?:the\s+)?([^.;\n,(]{2,40})/gi,
  /(?<![A-Za-z])((?:US|USA|U\.S\.|UK|EU|Canada|Europe|LATAM|EMEA)[- ](?:only|based only))(?![A-Za-z])/g,
  /(?<![A-Za-z])((?:US|U\.S\.)\s+(?:citizens?|residents?|persons?)\s+only|must\s+be\s+a\s+(?:US|U\.S\.)\s+citizen|requires?\s+(?:a\s+)?(?:US\s+)?security\s+clearance)/gi,
];

const WORLDWIDE_PHRASES = /(?:work|hire|hiring|open to candidates|apply)\s+from\s+anywhere|anywhere in the world|fully remote,? worldwide|globally remote|remote[- ]first,? worldwide|we hire (?:globally|worldwide)/i;

function scanRestrictions(description: string): { countries: string[]; regions: string[] } {
  const countries = new Set<string>();
  const regions = new Set<string>();
  const text = description.slice(0, 20000);
  for (const re of RESTRICTION_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const chunk = m[1] ?? m[0];
      if (/security\s+clearance|(?:US|U\.S\.)\s+citizen/i.test(chunk)) countries.add("US");
      for (const c of findCountries(chunk)) countries.add(c);
      for (const r of findRegions(chunk)) if (r !== "worldwide") regions.add(r);
    }
  }
  return { countries: [...countries], regions: [...regions] };
}

function detectWorkMode(input: EligibilityInput, hasRemoteSignals: boolean): WorkMode {
  const head = `${input.title} ${input.locationRaw ?? ""}`;
  if (/\bhybrid\b/i.test(head)) return "hybrid";
  if (/\b(?:on-?site|in[- ]office|office[- ]based|walk-?in)\b/i.test(head) && !/\bremote\b/i.test(head)) return "onsite";
  if (input.workModeHint) return input.workModeHint;
  if (hasRemoteSignals || /\b(?:remote|work from home|wfh|telecommute|distributed team)\b/i.test(head)) return "remote";
  if (/\b(?:fully remote|100% remote|remote position|remote role|work from home)\b/i.test(input.description.slice(0, 2000))) return "remote";
  if (input.city || input.locationRaw) return "onsite";
  return "unknown";
}

export function resolveEligibility(input: EligibilityInput): EligibilityResult {
  const loc = (input.locationRaw ?? "").trim();
  const structuredCountries = new Set<string>();
  const structuredRegions = new Set<string>();

  for (const raw of input.countriesRaw ?? []) {
    if (!raw) continue;
    const regs = findRegions(raw);
    const code = countryCode(raw);
    if (code) structuredCountries.add(code);
    else for (const r of regs) structuredRegions.add(r);
  }
  for (const c of findCountries(loc)) structuredCountries.add(c);
  for (const r of findRegions(loc)) structuredRegions.add(r);

  // A city in India implies India.
  const cityKey = (input.city ?? "").toLowerCase().trim();
  let city = input.city ?? null;
  let state = input.state ?? null;
  if (!city) {
    for (const name of Object.keys(INDIAN_CITIES)) {
      if (new RegExp(`(?<![a-z])${name}(?![a-z])`, "i").test(loc)) { city = name.replace(/\b\w/g, (c) => c.toUpperCase()); break; }
    }
  }
  const cityLower = (city ?? cityKey).toLowerCase();
  if (cityLower && INDIAN_CITIES[cityLower]) {
    state = state ?? INDIAN_CITIES[cityLower];
    structuredCountries.add("IN");
  }
  if (input.country) {
    const cc = countryCode(input.country);
    if (cc) structuredCountries.add(cc);
  }

  // Timezones
  const tzs: number[] = [];
  for (const t of input.timezonesRaw ?? []) {
    const n = parseTimezone(t);
    if (n !== null) tzs.push(n);
  }
  const tzText = `${loc} ${input.description.slice(0, 6000)}`;
  const tzWindow = tzText.match(/(?:within|overlap(?:ping)?(?: with)?|in|between)\s+(?:\+\/-\s*\d+\s*hours?\s+(?:of\s+)?)?([A-Z]{2,4}|(?:UTC|GMT)\s*[+-−]\s*\d{1,2}(?::\d{2})?)\s*(?:time\s*zone|timezone|hours|\(|\s*[±+]\s*\d)/);
  if (tzs.length === 0 && tzWindow) {
    const n = parseTimezone(tzWindow[1]);
    if (n !== null && tzWindow[1] !== "IN") tzs.push(n);
  }

  const restrictions = scanRestrictions(input.description);
  const worldwideStructured = structuredRegions.has("worldwide");
  const worldwidePhrase = WORLDWIDE_PHRASES.test(input.description);

  let countries = new Set(structuredCountries);
  let regions = new Set([...structuredRegions].filter((r) => r !== "worldwide"));
  let restrictionConflict = false;

  if (countries.size === 0 && regions.size === 0) {
    // No structured restriction: the description can still restrict.
    if (restrictions.countries.length || restrictions.regions.length) {
      restrictions.countries.forEach((c) => countries.add(c));
      restrictions.regions.forEach((r) => regions.add(r));
      if (worldwideStructured) restrictionConflict = true;
    }
  }

  const hasRemoteSignals = worldwideStructured || worldwidePhrase || regions.size > 0;
  const work_mode = detectWorkMode(input, hasRemoteSignals);
  const remote = work_mode === "remote";

  let eligibility_type: EligibilityType;
  if (!remote) {
    eligibility_type = countries.size ? "country_specific" : "unknown";
  } else if (countries.size) {
    eligibility_type = "country_specific";
  } else if (regions.size) {
    eligibility_type = "region_specific";
  } else if (worldwideStructured || (worldwidePhrase && !restrictionConflict)) {
    eligibility_type = "worldwide";
  } else if (tzs.length) {
    eligibility_type = "timezone_specific";
  } else {
    eligibility_type = "unknown";
  }

  let india: IndiaEligibility;
  const indiaRegion = [...regions].some((r) => REGIONS[r]?.includesIndia);
  if (countries.has("IN")) india = "explicit";
  else if (remote && indiaRegion) india = "region";
  else if (countries.size || regions.size) india = "not_eligible";
  else if (!remote) india = "unknown";
  else if (eligibility_type === "worldwide") {
    // Worldwide, but a timezone window that excludes IST makes it impractical; keep it honest.
    india = tzs.length && !tzs.some((t) => Math.abs(t - 5.5) <= 2.5) ? "not_eligible" : "worldwide";
  } else if (tzs.length) india = tzs.some((t) => Math.abs(t - 5.5) <= 1.5) ? "timezone" : "not_eligible";
  else india = "unknown";

  const countryList = [...countries].sort();
  const regionList = [...regions].sort();
  const tzList = [...new Set(tzs)].sort((a, b) => a - b).map(formatOffset);

  return {
    work_mode,
    remote_allowed: remote || work_mode === "hybrid",
    remote_worldwide: eligibility_type === "worldwide",
    eligibility_type,
    eligible_countries: countryList,
    eligible_regions: regionList,
    india_eligibility: india,
    timezone_requirements: tzList,
    timezone: tzList[0] ?? null,
    country: countryList.length === 1 ? countryList[0] : null,
    state,
    city,
    region: regionList.length ? regionName(regionList[0]) : null,
    location_text: loc || null,
    restriction_conflict: restrictionConflict,
  };
}

/** Human-readable eligibility line, e.g. "Remote — United States only". */
export function describeEligibility(e: Pick<EligibilityResult, "work_mode" | "eligibility_type" | "eligible_countries" | "eligible_regions" | "timezone_requirements" | "city">): string {
  const mode = e.work_mode === "remote" ? "Remote" : e.work_mode === "hybrid" ? "Hybrid" : e.work_mode === "onsite" ? "On-site" : "Location not specified";
  if (e.work_mode !== "remote") return e.city ? `${mode} — ${e.city}` : mode;
  switch (e.eligibility_type) {
    case "worldwide": return "Remote — Worldwide";
    case "country_specific": {
      const names = e.eligible_countries.map((c) => COUNTRIES[c]?.name ?? c);
      const regs = e.eligible_regions.map(regionName);
      const all = [...names, ...regs];
      return `Remote — ${all.slice(0, 3).join(", ")}${all.length > 3 ? ` +${all.length - 3}` : ""}${all.length === 1 ? " only" : ""}`;
    }
    case "region_specific": return `Remote — ${e.eligible_regions.map(regionName).join(", ")}`;
    case "timezone_specific": return `Remote — ${e.timezone_requirements.join(" to ")} timezones`;
    default: return "Remote — eligibility not specified";
  }
}
