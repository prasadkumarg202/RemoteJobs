import { describe, expect, it } from "vitest";
import { applyIntent, filtersFromParams, parseQueryIntent, paramsToQueryString } from "@/lib/jobs/filters";
import { indiaEligibility, payLabel, postedAgo, whereLabel } from "@/lib/jobs/format";
import { DICTS } from "@/lib/i18n";
import { TOPICS, PRESETS, pageMetadata } from "@/lib/jobs/pages";
import type { JobCard } from "@/lib/jobs/types";

const t = DICTS.en;

describe("search query intent", () => {
  const cases: Array<[string, Partial<ReturnType<typeof parseQueryIntent>>]> = [
    ["AI jobs remote", { text: "", sections: ["remote", "ai"] }],
    ["ChatGPT jobs", { text: "chatgpt", sections: [] }],
    ["n8n freelancer", { text: "n8n", sections: ["freelance"] }],
    ["Python remote India", { text: "python", sections: ["remote"], india: "eligible" }],
    ["SQL DBA remote", { text: "sql dba", sections: ["remote"] }],
    ["Azure remote", { text: "azure", sections: ["remote"] }],
    ["AI automation freelance", { text: "ai automation", sections: ["freelance"] }],
    ["data entry work from home", { text: "data entry", sections: ["wfh"] }],
    ["video editing freelance", { text: "video editing", sections: ["freelance"] }],
    ["part time content writer", { text: "content writer", types: ["part_time"] }],
  ];
  for (const [q, expected] of cases) {
    it(q, () => expect(parseQueryIntent(q)).toMatchObject(expected));
  }
  it("explicit URL filters win over intent", () => {
    const f = applyIntent({ india: "india_only", types: ["contract"] }, parseQueryIntent("python remote india part time"));
    expect(f.india).toBe("india_only");
    expect(f.types).toEqual(["contract"]);
    expect(f.q).toBe("python");
  });
});

describe("URL filters", () => {
  it("parses and sanitises params", () => {
    const f = filtersFromParams({ india: "india_apac", cat: "python,sql", salary: "10", posted: "7", sort: "bogus", page: "2", country: "in" });
    expect(f).toMatchObject({ india: "india_apac", categories: ["python", "sql"], salaryMinInr: 1_000_000, postedWithin: 7, sort: undefined, page: 2, country: "IN" });
    expect(filtersFromParams({ india: "mars" }).india).toBeUndefined();
  });
  it("resets the page when filters change", () => {
    expect(paramsToQueryString({ q: "python", page: "3" }, { type: "freelance" })).toBe("?q=python&type=freelance");
  });
});

const card = (o: Partial<JobCard>): JobCard => ({
  id: "1", slug: "x", title: "T", company_name: "C", company_logo: null, short_description: "", category: null, subcategory: null,
  employment_type: "full_time", work_mode: "remote", country: null, city: null, state: null, location_text: null, eligibility_type: "worldwide",
  eligible_countries: [], eligible_regions: [], india_eligibility: "worldwide", timezone_requirements: [], remote_worldwide: true,
  salary_min: null, salary_max: null, salary_currency: null, salary_period: null, salary_inr_min: null, salary_inr_max: null,
  budget_type: null, budget_min: null, budget_max: null, budget_currency: null, budget_period: null, experience_min: null, experience_max: null,
  seniority: "any", skills: [], keywords: [], sections: [], ai_score: 0, ai_relevance: "general", ai_category: null, job_duration: "unknown",
  posted_at: new Date().toISOString(), expires_at: null, source_name: "Jobicy", source_count: 1, risk_level: "low", is_featured: false, is_verified: false,
  application_method: "external", ...o,
});

describe("display formatting", () => {
  it("eligibility badge never says India eligible for US-only", () => {
    expect(indiaEligibility(card({ india_eligibility: "not_eligible" }), t).label).toBe(t.notForIndia);
    expect(indiaEligibility(card({ india_eligibility: "explicit" }), t).tone).toBe("open");
    expect(indiaEligibility(card({ india_eligibility: "timezone" }), t).label).toBe(t.istFriendly);
  });
  it("shows where a remote job is open", () => {
    expect(whereLabel(card({ eligibility_type: "country_specific", eligible_countries: ["US"] }), t)).toBe("Remote: United States");
    expect(whereLabel(card({ work_mode: "onsite", city: "Guntur", state: "Andhra Pradesh" }), t)).toBe("Guntur, Andhra Pradesh (On-site)");
  });
  it("formats salary with approximate INR, and budgets for gigs", () => {
    expect(payLabel(card({ salary_min: 80000, salary_max: 120000, salary_currency: "USD", salary_period: "yearly", salary_inr_min: 7040000, salary_inr_max: 10560000 })))
      .toEqual({ original: "$80K–$120K/year", inr: "≈ ₹70.4L–₹1.1Cr/year" });
    expect(payLabel(card({ budget_min: 5000, budget_max: 15000, budget_currency: "INR", budget_period: "project" })).original).toBe("₹5,000–₹15,000 project");
  });
  it("posted labels", () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    expect(postedAgo("2026-10-10T11:30:00Z", t, now)).toBe("Posted today");
    expect(postedAgo("2026-10-08T12:00:00Z", t, now)).toBe("Posted 2 days ago");
    expect(postedAgo("2026-09-22T12:00:00Z", t, now)).toBe("Posted 18 days ago");
  });
});

describe("SEO", () => {
  it("builds unique titles, canonical URLs and OpenGraph", () => {
    const titles = new Set(Object.values(PRESETS).map((p) => p.title));
    expect(titles.size).toBe(Object.keys(PRESETS).length);
    const m = pageMetadata({ title: "AI jobs", description: "d", path: "/jobs/ai" });
    expect(m.alternates?.canonical).toMatch(/\/jobs\/ai$/);
    expect(m.openGraph).toMatchObject({ title: "AI jobs" });
    expect(pageMetadata({ title: "x", description: "d", path: "/x", noindex: true }).robots).toMatchObject({ index: false });
  });
  it("covers the requested landing pages without auto-generated thin pages", () => {
    for (const p of ["/jobs/remote", "/jobs/remote/india", "/jobs/ai", "/jobs/ai/remote", "/jobs/ai/india", "/jobs/freelance"]) {
      expect(Object.values(PRESETS).some((x) => x.path === p)).toBe(true);
    }
    for (const s of ["chatgpt", "n8n", "python", "sql", "azure"]) expect(TOPICS[s]).toBeDefined();
    expect(Object.keys(TOPICS).length).toBeLessThan(25);
  });
});
