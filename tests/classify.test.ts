import { describe, expect, it } from "vitest";
import {
  assessRisk, classifyCategories, classifyDuration, classifyEmploymentType, classifySeniority, describeEligibility,
  formatMoneyRange, normalizeCompany, normalizeTitle, parseSalaryText, resolveEligibility, scoreAi, canonicalizeUrl, parseFeed,
} from "@engine";

const ai = (title: string, description: string, tags: string[] = []) => {
  const cat = classifyCategories({ title, description, tags });
  return scoreAi({ title, description, tags }, cat.matched);
};

describe("AI relevance score", () => {
  it("rates an LLM/RAG engineering role as a strong AI job", () => {
    const r = ai("Senior AI Engineer (LLM & RAG)", "Build Generative AI features with the OpenAI and Claude APIs, LangChain RAG pipelines, AI agents and prompt engineering in Python with PyTorch.");
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.relevance).toBe("strong_ai");
  });
  it("rates a classic ML engineer as AI related", () => {
    const r = ai("Machine Learning Engineer", "Train and deploy machine learning models with Python, PyTorch and scikit-learn.");
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(["ai_related", "strong_ai"]).toContain(r.relevance);
    expect(r.aiCategory).toBe("machine-learning");
  });
  it("does not label a job AI because of one passing mention", () => {
    const r = ai("Golang Engineer", "Build APIs in Go. We use AI tools like GitHub Copilot and ChatGPT day to day.");
    expect(r.score).toBeLessThan(40);
    expect(r.relevance).toBe("general");
  });
  it("does not treat test automation as AI automation", () => {
    expect(ai("QA Automation Engineer", "Own our test automation suite with Playwright.").relevance).toBe("general");
  });
  it("ignores Gemini when it is the company name", () => {
    const cat = classifyCategories({ title: "Backend Engineer", description: "Join Gemini, the crypto exchange.", companyName: "Gemini" });
    expect(cat.matched).not.toContain("gemini");
  });
  it("counts a title that names an AI tool", () => {
    const r = ai("Build n8n workflow to sync WhatsApp leads", "Automate WhatsApp leads into Google Sheets and send ChatGPT-generated replies.");
    expect(r.relevance).toBe("ai_automation");
    expect(ai("Zapier Expert to Automate CRM", "Connect HubSpot and Gmail with Zapier.").relevance).toBe("general");
  });
  it("classifies n8n automation freelance work", () => {
    const r = ai("AI Automation Specialist (n8n + ChatGPT)", "Automate workflows with n8n, Zapier and Make.com and integrate ChatGPT.");
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.aiCategory).toBe("ai-automation");
  });
});

describe("categories & skills", () => {
  it("does not confuse Java with JavaScript", () => {
    const c = classifyCategories({ title: "JavaScript Developer", description: "Modern JavaScript and Node.js." });
    expect(c.matched).toContain("javascript");
    expect(c.matched).not.toContain("java");
  });
  it("detects C#, .NET and SQL", () => {
    const c = classifyCategories({ title: ".NET Developer (C#)", description: "ASP.NET Core and SQL Server." });
    expect(c.matched).toEqual(expect.arrayContaining(["dotnet", "csharp", "sql"]));
    expect(c.category).toBe("software-development");
  });
  it("puts creative work in the creative group", () => {
    const c = classifyCategories({ title: "YouTube Shorts Video Editor", description: "Edit Shorts with CapCut and Premiere Pro." });
    expect(c.category).toBe("creative");
    expect(c.subcategory).toBe("video-editing");
  });
});

describe("employment type, duration, seniority", () => {
  it("detects freelance, gig, contract, part-time, internship", () => {
    expect(classifyEmploymentType(["full-time"], "Freelance React Developer", "")).toBe("freelance");
    expect(classifyEmploymentType(null, "Power BI Dashboard Developer (gig)", "")).toBe("gig");
    expect(classifyEmploymentType(["contract"], "SQL DBA", "")).toBe("contract");
    expect(classifyEmploymentType("Part Time", "Virtual Assistant", "")).toBe("part_time");
    expect(classifyEmploymentType(null, "Data Science Intern", "")).toBe("internship");
    expect(classifyEmploymentType(["Full-Time", "Contract"], "Engineer", "")).toBe("full_time");
    expect(classifyEmploymentType(null, "Logo designer", "This is a fixed-price project for our brand.")).toBe("freelance");
  });
  it("parses durations", () => {
    expect(classifyDuration("One-time project to build a landing page", "freelance")).toBe("one_time");
    expect(classifyDuration("Project duration: 6 weeks.", "contract")).toBe("1_to_3_months");
    expect(classifyDuration("This is a 3 month contract", "contract")).toBe("1_to_3_months");
    expect(classifyDuration("6 month contract", "contract")).toBe("3_to_6_months");
    expect(classifyDuration("Gig with delivery within 2 weeks", "gig")).toBe("less_than_1_month");
    expect(classifyDuration("Ongoing contract, 10 hours a week", "contract")).toBe("ongoing");
    expect(classifyDuration("Help us grow", "freelance")).toBe("unknown");
  });
  it("derives seniority & experience", () => {
    expect(classifySeniority("Senior", "Engineer", "").seniority).toBe("senior");
    const r = classifySeniority(null, "Developer", "You have 3-5 years of experience with React.");
    expect([r.experienceMin, r.experienceMax, r.seniority]).toEqual([3, 5, "mid"]);
    expect(classifySeniority(null, "Data Entry Operator", "Freshers can apply. No experience required.").seniority).toBe("entry");
  });
});

describe("location eligibility (remote ≠ worldwide)", () => {
  const base = { title: "Engineer", description: "", workModeHint: "remote" as const };
  it("US-only remote is not India eligible", () => {
    const e = resolveEligibility({ ...base, locationRaw: "USA" });
    expect(e.eligibility_type).toBe("country_specific");
    expect(e.eligible_countries).toEqual(["US"]);
    expect(e.india_eligibility).toBe("not_eligible");
    expect(describeEligibility(e)).toBe("Remote — United States only");
  });
  it("worldwide jobs are India eligible", () => {
    const e = resolveEligibility({ ...base, locationRaw: "Anywhere" });
    expect(e.eligibility_type).toBe("worldwide");
    expect(e.india_eligibility).toBe("worldwide");
  });
  it("explicit India listing", () => {
    expect(resolveEligibility({ ...base, countriesRaw: ["India"] }).india_eligibility).toBe("explicit");
  });
  it("APAC region counts as India + APAC, EMEA does not", () => {
    expect(resolveEligibility({ ...base, locationRaw: "APAC" }).india_eligibility).toBe("region");
    expect(resolveEligibility({ ...base, locationRaw: "EMEA" }).india_eligibility).toBe("not_eligible");
  });
  it("timezone windows", () => {
    expect(resolveEligibility({ ...base, timezonesRaw: [5.5] }).india_eligibility).toBe("timezone");
    expect(resolveEligibility({ ...base, timezonesRaw: ["UTC-8", "UTC-5"] }).india_eligibility).toBe("not_eligible");
    expect(resolveEligibility({ ...base, timezonesRaw: [-5] }).eligibility_type).toBe("timezone_specific");
  });
  it("a description restriction overrides a 'Worldwide' label", () => {
    const e = resolveEligibility({ ...base, locationRaw: "Worldwide", description: "Candidates must be located in the United States." });
    expect(e.eligible_countries).toEqual(["US"]);
    expect(e.india_eligibility).toBe("not_eligible");
    expect(e.restriction_conflict).toBe(true);
  });
  it("security clearance implies US only", () => {
    expect(resolveEligibility({ ...base, description: "US citizens only; requires security clearance." }).india_eligibility).toBe("not_eligible");
  });
  it("missing location stays unknown (never assumed worldwide)", () => {
    const e = resolveEligibility({ ...base });
    expect(e.eligibility_type).toBe("unknown");
    expect(e.india_eligibility).toBe("unknown");
  });
  it("an Indian city means a local India job", () => {
    const e = resolveEligibility({ title: "Store Manager", description: "", locationRaw: "Vijayawada, Andhra Pradesh" });
    expect(e.work_mode).toBe("onsite");
    expect(e.city).toBe("Vijayawada");
    expect(e.state).toBe("Andhra Pradesh");
    expect(e.india_eligibility).toBe("explicit");
  });
  it("hybrid in the title wins over the remote hint", () => {
    expect(resolveEligibility({ ...base, title: "Engineer (Hybrid, Hyderabad)" }).work_mode).toBe("hybrid");
  });
  it("does not read 'join us' as the United States", () => {
    expect(resolveEligibility({ ...base, locationRaw: "Remote - join us anywhere in the world" }).eligible_countries).toEqual([]);
  });
});

describe("salary", () => {
  it("parses common formats", () => {
    expect(parseSalaryText("$80,000 – $120,000/year")).toMatchObject({ min: 80000, max: 120000, currency: "USD", period: "yearly" });
    expect(parseSalaryText("USD 80k-120k per year")).toMatchObject({ min: 80000, max: 120000, currency: "USD" });
    expect(parseSalaryText("₹5,000–₹15,000 per project")).toMatchObject({ min: 5000, max: 15000, currency: "INR", period: "project" });
    expect(parseSalaryText("$20-$40/hr")).toMatchObject({ min: 20, max: 40, period: "hourly" });
    expect(parseSalaryText("8-12 LPA")).toMatchObject({ min: 800000, max: 1200000, currency: "INR", period: "yearly" });
    expect(parseSalaryText("Competitive")).toBeNull();
  });
  it("formats original and INR ranges", () => {
    expect(formatMoneyRange(80000, 120000, "USD", "yearly")).toBe("$80K–$120K/year");
    expect(formatMoneyRange(20, 40, "USD", "hourly")).toBe("$20–$40/hour");
    expect(formatMoneyRange(5000, 15000, "INR", "project")).toBe("₹5,000–₹15,000 project");
    expect(formatMoneyRange(7040000, 10560000, "INR", "yearly")).toBe("₹70.4L–₹1.1Cr/year");
    expect(formatMoneyRange(null, null, null, null)).toBeNull();
  });
});

describe("risk checks", () => {
  it("flags scam patterns as high risk without calling it a scam", () => {
    const r = assessRisk({
      title: "Work From Home Typing Job – Earn $500 per day",
      description: "Earn $500 per day from home, no experience needed! Pay a registration fee of $20 to start. Salary paid in USDT. Contact us on Telegram only.",
      companyName: "QuickEarn Online", applyUrl: "https://t.me/quickearn", salaryIssues: [], expiresAt: null, trustedSource: false,
    });
    expect(r.level).toBe("high");
    expect(r.flags).toEqual(expect.arrayContaining(["registration_fee", "crypto_payment", "suspicious_domain"]));
  });
  it("keeps a normal job low risk", () => {
    const r = assessRisk({ title: "Backend Engineer", description: "Build APIs in Node.js. ".repeat(10), companyName: "Parcelpoint", applyUrl: "https://parcelpoint.example/jobs/1", salaryIssues: [], expiresAt: null, trustedSource: true });
    expect(r.level).toBe("low");
  });
  it("flags WhatsApp-only employer posts for review", () => {
    const r = assessRisk({ title: "Delivery boy", description: "Contact on WhatsApp", companyName: "Local Shop", applyUrl: null, applyWhatsapp: "+919876543210", salaryIssues: [], expiresAt: null, trustedSource: false });
    expect(r.flags).toContain("whatsapp_only");
  });
});

describe("normalization helpers", () => {
  it("normalizes titles and companies for dedupe", () => {
    expect(normalizeTitle("Sr. AI Engineer (LLM & RAG) – Remote")).toBe(normalizeTitle("Senior AI Engineer (LLM & RAG)"));
    expect(normalizeCompany("Lumora Labs Inc.")).toBe(normalizeCompany("Lumora Labs"));
  });
  it("canonicalizes URLs (drops tracking params, www, trailing slash)", () => {
    expect(canonicalizeUrl("http://www.Example.com/jobs/1/?utm_source=x&id=2#top")).toBe("https://example.com/jobs/1?id=2");
  });
  it("parses RSS with CDATA and namespaces", () => {
    const items = parseFeed(`<rss><channel><item><title><![CDATA[AI & ML]]></title><link>https://x.test/1</link><media:content url="https://x.test/logo.png"/></item></channel></rss>`);
    expect(items[0].f.title).toBe("AI & ML");
    expect(items[0].attrs["media:content"].url).toBe("https://x.test/logo.png");
  });
});
