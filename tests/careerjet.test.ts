import { describe, expect, it } from "vitest";
import { careerjetAuthHeader, careerjetPlace, careerjetQueryUrl, careerjetSiteUrl, parseCareerjet, visitorIp } from "@/lib/jobs/careerjet-core";

describe("Careerjet", () => {
  it("opens Careerjet India's own search with the visitor's words", () => {
    const u = new URL(careerjetSiteUrl(" python developer ", "Hyderabad"));
    expect(u.origin).toBe("https://www.careerjet.co.in");
    expect(u.searchParams.get("s")).toBe("python developer");
    expect(u.searchParams.get("l")).toBe("Hyderabad");
  });

  it("picks the place: city, then district head town, then state, then India", () => {
    expect(careerjetPlace({ city: "Vijayawada" })).toBe("Vijayawada");
    expect(careerjetPlace({ district: "ranga-reddy" })).toBe("Hyderabad");
    expect(careerjetPlace({ state: "Andhra Pradesh" })).toBe("Andhra Pradesh");
    expect(careerjetPlace({ state: "all" })).toBe("India");
    expect(careerjetPlace({})).toBe("India");
  });

  it("builds a live query for one visitor (India locale, visitor IP + browser)", () => {
    const u = new URL(careerjetQueryUrl({ q: "data entry", place: "India", ip: "49.36.1.2", ua: "Mozilla/5.0" }));
    expect(u.origin + u.pathname).toBe("https://search.api.careerjet.net/v4/query");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ locale_code: "en_IN", keywords: "data entry", location: "India", user_ip: "49.36.1.2", user_agent: "Mozilla/5.0", page_size: "8" });
    expect(careerjetAuthHeader("abc")).toBe(`Basic ${Buffer.from("abc:").toString("base64")}`);
  });

  it("takes the first forwarded IP and rejects junk", () => {
    expect(visitorIp("49.36.1.2, 10.0.0.1", null)).toBe("49.36.1.2");
    expect(visitorIp(null, "2401:4900::1")).toBe("2401:4900::1");
    expect(visitorIp("<script>", null)).toBeNull();
    expect(visitorIp(null, null)).toBeNull();
  });

  it("keeps only safe https results and strips HTML", () => {
    const r = parseCareerjet({
      type: "JOBS", hits: 120,
      jobs: [
        { url: "https://jobviewtrack.com/en-in/job-abc", title: "<b>Data Entry</b> Operator", company: "Sunrise", locations: "Hyderabad, Telangana", date: "Fri, 16 Oct 2026", salary: "₹15,000 per month", description: "Work from home &amp; part time" },
        { url: "javascript:alert(1)", title: "Bad" },
        { url: "https://jobviewtrack.com/x", title: "" },
      ],
    });
    expect(r.hits).toBe(120);
    expect(r.jobs).toHaveLength(1);
    expect(r.jobs[0]).toMatchObject({ title: "Data Entry Operator", description: "Work from home & part time", company: "Sunrise" });
    expect(parseCareerjet({ type: "LOCATIONS", solveLocations: [] }).jobs).toEqual([]);
    expect(parseCareerjet(null).jobs).toEqual([]);
  });
});
