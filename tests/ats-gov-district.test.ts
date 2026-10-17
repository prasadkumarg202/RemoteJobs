import { describe, expect, it } from "vitest";
import { DISTRICTS, findDistrict, GreenhouseAdapter, LeverAdapter, normalizeJob, parseBoardLines, runSync } from "@engine";
import { applyIntent, filtersFromParams, parseQueryIntent } from "@/lib/jobs/filters";
import { checkOfficialUrl, GOV_ORG_BY_SLUG, govToRaw, validateGov, type GovNotificationInput } from "@/lib/jobs/government";
import { whereLabel } from "@/lib/jobs/format";
import { DICTS } from "@/lib/i18n";
import { FIXTURE_NOW, fakeFetch, fixtureJson, json, makeRepo } from "./helpers.ts";

const now = FIXTURE_NOW;
const jobsOf = (repo: ReturnType<typeof makeRepo>, src: string) => [...repo.jobs.values()].filter((j) => j.source_id === `src-${src}`);

describe("districts", () => {
  it("has 28 AP and 33 Telangana districts with unique slugs and Telugu names", () => {
    expect(DISTRICTS.filter((d) => d.state === "AP")).toHaveLength(28);
    expect(DISTRICTS.filter((d) => d.state === "TS")).toHaveLength(33);
    expect(new Set(DISTRICTS.map((d) => d.slug)).size).toBe(61);
    for (const d of DISTRICTS) expect(d.name_te).toMatch(/[ఀ-౿]/);
  });
  const cases: Array<[string, string | null]> = [
    ["Gachibowli, Hyderabad", "ranga-reddy"], ["HITEC City, Hyderabad, Telangana", "ranga-reddy"], ["Kukatpally, Hyderabad", "medchal-malkajgiri"],
    ["Hyderabad, Telangana", "hyderabad"], ["Secunderabad", "hyderabad"], ["Vijayawada, Andhra Pradesh", "ntr"], ["Vizag", "visakhapatnam"],
    ["Rajahmundry", "east-godavari"], ["Tirupati", "tirupati"], ["Markapuram", "markapuram"], ["West Godavari", "west-godavari"],
    ["Hanamkonda", "hanumakonda"], ["Krishna Nagar, Bengaluru", null], ["Bengaluru", null], ["Remote", null],
  ];
  for (const [text, slug] of cases) it(`${text} → ${slug}`, () => expect(findDistrict(text)).toBe(slug));
});

describe("district + state filters and the Fresher intent", () => {
  it("parses URL params", () => {
    expect(filtersFromParams({ district: "guntur", state: "ap" })).toMatchObject({ district: "guntur", state: "Andhra Pradesh" });
    expect(filtersFromParams({ state: "ts" }).state).toBe("Telangana");
    expect(filtersFromParams({ state: "all" }).state).toBe("all_india");
    expect(filtersFromParams({ district: "atlantis", state: "xx" })).toMatchObject({ district: undefined, state: undefined });
  });
  it("turns 'fresher' and AP/TS place names in the search box into filters", () => {
    const i = parseQueryIntent("accountant fresher jobs in Guntur");
    expect(i).toMatchObject({ text: "accountant", seniority: ["entry"], district: "guntur" });
    expect(applyIntent({}, i)).toMatchObject({ q: "accountant", seniority: ["entry"], district: "guntur" });
    expect(parseQueryIntent("python developer gachibowli").district).toBe("ranga-reddy");
    expect(parseQueryIntent("krishna tutor").district).toBeUndefined();
  });
  it("labels the experience filter Fresher / Entry level", () => {
    expect(DICTS.en.entry).toBe("Fresher / Entry level");
    expect(DICTS.te.entry).toContain("ఫ్రెషర్");
  });
});

describe("Greenhouse + Lever company boards", () => {
  it("parses the admin board list", () => {
    const r = parseBoardLines("acme | Acme Software\n# comment\n\nglobex|Globex|eu\nbad token!\nacme | dup");
    expect(r.boards).toEqual([{ token: "acme", company: "Acme Software", eu: false }, { token: "globex", company: "Globex", eu: true }]);
    expect(r.errors).toHaveLength(1);
  });

  it("does nothing without boards", async () => {
    const repo = makeRepo();
    repo.addSource({ slug: "greenhouse", name: "Greenhouse", full_feed: true, config: { boards: [] } });
    const f = fakeFetch({});
    const r = await runSync(new GreenhouseAdapter(), repo, { fetchImpl: f, now, force: true });
    expect(f.calls).toEqual([]);
    expect(r.jobs_added).toBe(0);
  });

  it("Greenhouse: decodes HTML, keeps India/remote jobs, assigns districts, closes removed jobs", async () => {
    const repo = makeRepo();
    repo.addSource({ slug: "greenhouse", name: "Greenhouse", api_url: "https://boards-api.greenhouse.io/v1/boards", full_feed: true,
      config: { boards: [{ token: "acme", company: "Acme Software" }, { token: "gone", company: "Gone Inc" }], full_feed_min: 1 } });
    const payload = fixtureJson<{ jobs: unknown[] }>("greenhouse-acme.json");
    let f = fakeFetch({ "boards-api.greenhouse.io/v1/boards/acme/jobs": (u) => { expect(u.searchParams.get("content")).toBe("true"); return json(payload); } });
    let r = await runSync(new GreenhouseAdapter(), repo, { fetchImpl: f, now, force: true, pageDelayMs: 0 });
    expect(r.jobs_added).toBe(2); // NYC on-site job filtered, empty title invalid
    expect(r.errors.join(" ")).toMatch(/gone/); // one board failed → reported
    const js = jobsOf(repo, "greenhouse");
    const ml = js.find((j) => j.title.startsWith("Senior Machine"))!;
    expect(ml.company_name).toBe("Acme Software");
    expect(ml.description).not.toMatch(/&lt;|<p>/);
    expect(ml.ai_relevance).toBe("strong_ai");
    expect([ml.city, ml.state, ml.district]).toEqual(["Hyderabad", "Telangana", "hyderabad"]);
    expect(ml.external_url).toBe("https://job-boards.greenhouse.io/acme/jobs/4001");
    const cs = js.find((j) => j.title === "Customer Success Manager")!;
    expect([cs.work_mode, cs.india_eligibility, cs.district]).toEqual(["remote", "explicit", null]);

    // A board failed → partial run → nothing is closed even though job 4002 is missing next time
    f = fakeFetch({ "boards-api.greenhouse.io/v1/boards/acme/jobs": () => json({ jobs: [payload.jobs[0]] }) });
    r = await runSync(new GreenhouseAdapter(), repo, { fetchImpl: f, now, force: true, pageDelayMs: 0 });
    expect(r.jobs_expired).toBe(0);
    // Every board answered → missing job is closed
    repo.sources.get("greenhouse")!.config = { boards: [{ token: "acme", company: "Acme Software" }], full_feed_min: 1 };
    r = await runSync(new GreenhouseAdapter(), repo, { fetchImpl: f, now, force: true, pageDelayMs: 0 });
    expect(r.jobs_expired).toBe(1);
  });

  it("Lever: workplace type, salary, fresher seniority, US-only remote marked not eligible, EU host", async () => {
    const repo = makeRepo();
    repo.addSource({ slug: "lever", name: "Lever", api_url: "https://api.lever.co/v0/postings", full_feed: true,
      config: { boards: [{ token: "globex", company: "Globex" }, { token: "euco", company: "EU Co", eu: true }], location_filter: "india_or_remote" } });
    const f = fakeFetch({
      "api.lever.co/v0/postings/globex": (u) => { expect(u.searchParams.get("mode")).toBe("json"); return json(fixtureJson("lever-globex.json")); },
      "api.eu.lever.co/v0/postings/euco": () => json([]),
    });
    const r = await runSync(new LeverAdapter(), repo, { fetchImpl: f, now, force: true, pageDelayMs: 0 });
    expect(r.errors.filter((e) => !/were skipped/.test(e))).toEqual([]);
    expect(f.calls.some((c) => c.startsWith("https://api.eu.lever.co/"))).toBe(true);
    const js = jobsOf(repo, "lever");
    expect(js.map((j) => j.title).sort()).toEqual(["Data Analyst (Fresher)", "Remote Backend Engineer (Go)"]); // Berlin skipped
    const da = js.find((j) => j.title.startsWith("Data Analyst"))!;
    expect([da.work_mode, da.district, da.state, da.seniority]).toEqual(["onsite", "ntr", "Andhra Pradesh", "entry"]);
    expect([da.salary_min, da.salary_max, da.salary_currency, da.salary_period]).toEqual([300000, 420000, "INR", "yearly"]);
    expect(da.apply_url).toBe("https://jobs.lever.co/globex/a1b2c3/apply");
    expect(da.sections).toContain("local");
    expect(js.find((j) => j.title.startsWith("Remote Backend"))!.india_eligibility).toBe("not_eligible");
  });
});

describe("government notifications", () => {
  const base: GovNotificationInput = {
    id: "11111111-1111-1111-1111-111111111111", orgSlug: "appsc", scope: "AP", postName: "Group-II Services", notificationNo: "11/2026",
    vacancies: 905, qualification: "Any degree", ageLimit: "18–42 years", fee: "₹250 application + ₹80 exam fee", lastDate: "2026-11-20",
    notificationUrl: "https://psc.ap.gov.in/Documents/Notifications/2026/Group2.pdf", district: null,
  };
  const opts = { allowUnofficial: false, today: "2026-10-14" };

  it("accepts official domains only (unless the admin confirms)", () => {
    expect(checkOfficialUrl("https://psc.ap.gov.in/x.pdf", GOV_ORG_BY_SLUG.appsc).ok).toBe(true);
    expect(checkOfficialUrl("https://www.tgprb.in/notice", GOV_ORG_BY_SLUG["tg-slprb"]).ok).toBe(true);
    expect(checkOfficialUrl("https://cfw.ap.nic.in/x", GOV_ORG_BY_SLUG.other).ok).toBe(true);
    expect(checkOfficialUrl("https://sarkari-results.example.com/appsc", GOV_ORG_BY_SLUG.appsc).ok).toBe(false);
    expect(checkOfficialUrl("https://psc.ap.gov.in.evil.com/x", GOV_ORG_BY_SLUG.appsc).ok).toBe(false);
    expect(validateGov({ ...base, notificationUrl: "https://freejobalert.example/x" }, opts).notificationUrl).toMatch(/not an official/);
    expect(validateGov({ ...base, notificationUrl: "https://freejobalert.example/x" }, { ...opts, allowUnofficial: true }).notificationUrl).toBeUndefined();
    expect(validateGov({ ...base, notificationUrl: "javascript:alert(1)" }, { ...opts, allowUnofficial: true }).notificationUrl).toBeTruthy();
  });

  it("validates dates, district/state and required fields", () => {
    expect(validateGov(base, opts)).toEqual({});
    expect(validateGov({ ...base, lastDate: "2026-10-01" }, opts).lastDate).toMatch(/passed/);
    expect(validateGov({ ...base, district: "karimnagar" }, opts).district).toMatch(/not in the chosen state/);
    expect(validateGov({ ...base, orgSlug: "other", orgName: "" }, opts).orgName).toBeTruthy();
  });

  it("becomes a government job: not local, expires end of last date IST, links to the notification", async () => {
    const { job } = await normalizeJob(govToRaw(base), { sourceId: "src-manual", sourceSlug: "manual", sourceName: "Mana Kosamu", rates: { INR: 1 }, trustedSource: true, now: new Date("2026-10-14T10:00:00Z") } as never);
    expect(job.title).toBe("Group-II Services (APPSC)");
    expect(job.company_name).toBe("Andhra Pradesh Public Service Commission");
    expect(job.sections).toEqual(["government"]);
    expect(job.is_government).toBe(true);
    expect([job.state, job.city, job.district]).toEqual(["Andhra Pradesh", null, null]);
    expect(job.expires_at).toBe("2026-11-20T18:29:59.000Z");
    expect(job.apply_url).toBe(base.notificationUrl);
    expect(job.description).toMatch(/Vacancies: 905/);
    expect(job.description).toMatch(/does not collect applications or any fee/);

    const ups = await normalizeJob(govToRaw({ ...base, orgSlug: "upsc", scope: "IN", postName: "Civil Services Examination 2027", notificationUrl: "https://upsc.gov.in/x.pdf" }), { sourceId: "s", sourceSlug: "manual", sourceName: "Mana Kosamu", rates: { INR: 1 }, trustedSource: true } as never);
    expect([ups.job.state, ups.job.country]).toEqual([null, "IN"]);
    expect(whereLabel({ ...ups.job, sections: ups.job.sections } as never, DICTS.en)).toBe("All India");

    const dsc = await normalizeJob(govToRaw({ ...base, orgSlug: "other", orgName: "District Selection Committee, Guntur", postName: "School Assistant", district: "guntur", notificationUrl: "https://guntur.ap.gov.in/dsc.pdf" }), { sourceId: "s", sourceSlug: "manual", sourceName: "Mana Kosamu", rates: { INR: 1 }, trustedSource: true } as never);
    expect([dsc.job.district, dsc.job.state, dsc.job.city]).toEqual(["guntur", "Andhra Pradesh", "Guntur"]);
    expect(dsc.job.sections).toEqual(["government"]);
    expect(whereLabel({ ...dsc.job } as never, DICTS.en)).toBe("Guntur, Andhra Pradesh");
  });
});
