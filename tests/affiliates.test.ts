import { describe, expect, it } from "vitest";
import { AFFILIATE_CATALOG, envLinks, isValidAffiliateUrl, mergeLinks, partnersFor, PLACEMENTS, type AffiliateLink } from "@/lib/affiliates/catalog";
import { DICTS } from "@/lib/i18n";
import { readFileSync } from "node:fs";

const on = (url: string, placements: AffiliateLink["placements"] = null): AffiliateLink => ({ url, enabled: true, placements });

describe("affiliate catalog", () => {
  it("every partner has EN + TE copy, a sign-up link and at least one placement", () => {
    const slugs = new Set<string>();
    for (const p of AFFILIATE_CATALOG) {
      expect(slugs.has(p.slug)).toBe(false);
      slugs.add(p.slug);
      expect(p.slug).toMatch(/^[a-z0-9-]{2,40}$/);
      for (const lang of ["en", "te"] as const) {
        expect(p.blurb[lang].length).toBeGreaterThan(10);
        expect(p.cta[lang].length).toBeGreaterThan(2);
      }
      expect(p.program.signup).toMatch(/^https:\/\//);
      expect(p.placements.length).toBeGreaterThan(0);
      for (const pl of p.placements) expect(PLACEMENTS).toContain(pl);
    }
  });

  it("migration seeds exactly the catalog slugs", () => {
    const sql = readFileSync("supabase/migrations/20261014000002_affiliate_partners.sql", "utf8");
    const seeded = [...sql.matchAll(/\('([a-z0-9-]+)'\)/g)].map((m) => m[1]).sort();
    expect(seeded).toEqual(AFFILIATE_CATALOG.map((p) => p.slug).sort());
  });

  it("disclosure and slot titles exist in both languages", () => {
    for (const t of [DICTS.en, DICTS.te]) {
      expect(t.affiliateDisclosure.length).toBeGreaterThan(20);
      for (const k of ["toolsRemote", "toolsAi", "toolsFreelance", "toolsWfh", "toolsJob", "toolsPost", "sponsored"] as const) expect(t[k]).toBeTruthy();
    }
  });
});

describe("affiliate links", () => {
  it("accepts only public https links", () => {
    expect(isValidAffiliateUrl("https://go.fiverr.com/visit/?bta=123&brand=fiverrmarketplace")).toBe(true);
    expect(isValidAffiliateUrl("https://upwork.pxf.io/c/123/456/789")).toBe(true);
    for (const bad of ["http://fiverr.com/x", "javascript:alert(1)", "data:text/html,hi", "https://localhost/x", "https://127.0.0.1/x",
      "https://user:pw@evil.com", "https://intranet/x", "", null, undefined, `https://a.com/${"x".repeat(1001)}`]) {
      expect(isValidAffiliateUrl(bad as string)).toBe(false);
    }
  });

  it("shows nothing until a link is added", () => {
    for (const pl of PLACEMENTS) expect(partnersFor(pl, {})).toEqual([]);
    expect(partnersFor("freelance", { canva: { url: null, enabled: true, placements: null } })).toEqual([]);
    expect(partnersFor("freelance", { canva: { url: "https://canva.com/x", enabled: false, placements: null } })).toEqual([]);
  });

  it("respects default placements, custom placements, catalog order and the per-slot cap", () => {
    const links = { payoneer: on("https://payoneer.com/r/1"), udemy: on("https://udemy.com/a"), canva: on("https://canva.com/a"), hostinger: on("https://hostinger.com/a"), coursera: on("https://coursera.org/a") };
    expect(partnersFor("freelance", links).map((p) => p.slug)).toEqual(["udemy", "canva", "hostinger"]);
    expect(partnersFor("ai", links).map((p) => p.slug)).toEqual(["coursera", "udemy"]);
    expect(partnersFor("job", links).map((p) => p.slug)).toEqual(["coursera"]);
    expect(partnersFor("job", { ...links, payoneer: on("https://payoneer.com/r/1", ["job"]) }).map((p) => p.slug)).toEqual(["coursera", "payoneer"]);
  });

  it("env links work without a database; database links override them", () => {
    const env = envLinks({ AFFILIATE_URL_FIVERR: "https://go.fiverr.com/visit/?bta=1", AFFILIATE_URL_WISE: "http://insecure.example", AFFILIATE_URL_NOPE: "https://x.com" });
    expect(Object.keys(env)).toEqual(["fiverr"]);
    const merged = mergeLinks({ fiverr: { url: "https://go.fiverr.com/visit/?bta=2", enabled: false, placements: null }, upwork: { url: null, enabled: false, placements: null } }, env);
    expect(merged.fiverr).toEqual({ url: "https://go.fiverr.com/visit/?bta=2", enabled: false, placements: null });
    expect(merged.upwork).toBeUndefined();
    expect(partnersFor("post", merged)).toEqual([]);
  });
});
