// Government job notifications entered by Mana Kosamu admins from official recruitment portals.
// Pure helpers (no server imports) so they are unit-tested and shared by the admin form.

import type { RawJob } from "@engine/types.ts";
import { DISTRICT_BY_SLUG, STATE_NAMES } from "@engine/districts.ts";

export type GovScope = "AP" | "TS" | "IN";

export interface GovOrg {
  slug: string;
  name: string;
  short: string;
  scope: GovScope;
  /** Official domains (exact host or any subdomain). */
  domains: string[];
  portal: string;
}

export const GOV_ORGS: GovOrg[] = [
  { slug: "appsc", short: "APPSC", name: "Andhra Pradesh Public Service Commission", scope: "AP", domains: ["psc.ap.gov.in"], portal: "https://psc.ap.gov.in" },
  { slug: "tgpsc", short: "TGPSC", name: "Telangana Public Service Commission", scope: "TS", domains: ["tspsc.gov.in", "tgpsc.gov.in"], portal: "https://www.tspsc.gov.in" },
  { slug: "upsc", short: "UPSC", name: "Union Public Service Commission", scope: "IN", domains: ["upsc.gov.in", "upsconline.nic.in", "upsconline.gov.in"], portal: "https://upsc.gov.in" },
  { slug: "ssc", short: "SSC", name: "Staff Selection Commission", scope: "IN", domains: ["ssc.gov.in", "ssc.nic.in"], portal: "https://ssc.gov.in" },
  { slug: "ibps", short: "IBPS", name: "Institute of Banking Personnel Selection", scope: "IN", domains: ["ibps.in"], portal: "https://www.ibps.in" },
  { slug: "rrb", short: "RRB", name: "Railway Recruitment Boards", scope: "IN", domains: ["rrbcdg.gov.in", "rrbapply.gov.in", "indianrailways.gov.in", "rrbsecunderabad.gov.in"], portal: "https://www.rrbcdg.gov.in" },
  { slug: "ap-slprb", short: "AP SLPRB", name: "AP State Level Police Recruitment Board", scope: "AP", domains: ["slprb.ap.gov.in"], portal: "https://slprb.ap.gov.in" },
  { slug: "tg-slprb", short: "TGSLPRB", name: "Telangana State Level Police Recruitment Board", scope: "TS", domains: ["tgprb.in", "tslprb.in"], portal: "https://www.tgprb.in" },
  { slug: "other", short: "", name: "Other government department", scope: "IN", domains: [], portal: "" },
];

export const GOV_ORG_BY_SLUG: Record<string, GovOrg> = Object.fromEntries(GOV_ORGS.map((o) => [o.slug, o]));

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/**
 * Official link check: the organisation's own domains, or any *.gov.in / *.nic.in host.
 * Returns why a link was refused so the admin can fix it.
 */
export function checkOfficialUrl(raw: string, org?: GovOrg): { ok: true; url: string } | { ok: false; reason: string } {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, reason: "Not a valid link" }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, reason: "Link must start with https://" };
  if (u.username || u.password) return { ok: false, reason: "Link must not contain a username or password" };
  const host = u.hostname.toLowerCase();
  if (org?.domains.some((d) => hostMatches(host, d))) return { ok: true, url: u.toString() };
  if (/\.(gov\.in|nic\.in)$/.test(host)) return { ok: true, url: u.toString() };
  return { ok: false, reason: `${host} is not an official government domain (.gov.in / .nic.in${org?.domains.length ? ` / ${org.domains.join(", ")}` : ""})` };
}

export interface GovNotificationInput {
  id: string;
  orgSlug: string;
  /** Required when orgSlug = "other". */
  orgName?: string | null;
  scope: GovScope;
  district?: string | null;
  postName: string;
  notificationNo?: string | null;
  vacancies?: number | null;
  qualification?: string | null;
  ageLimit?: string | null;
  fee?: string | null;
  startDate?: string | null; // YYYY-MM-DD
  lastDate: string; // YYYY-MM-DD (inclusive, IST)
  notificationUrl: string;
  applyUrl?: string | null;
  details?: string | null;
  salaryText?: string | null;
}

export type GovErrors = Partial<Record<keyof GovNotificationInput | "official", string>>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fmtDate = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export function validateGov(i: GovNotificationInput, opts: { allowUnofficial: boolean; today: string }): GovErrors {
  const e: GovErrors = {};
  const org = GOV_ORG_BY_SLUG[i.orgSlug];
  if (!org) e.orgSlug = "Choose the recruiting organisation.";
  if (i.orgSlug === "other" && !i.orgName?.trim()) e.orgName = "Enter the department name.";
  if (!["AP", "TS", "IN"].includes(i.scope)) e.scope = "Choose where the posts are.";
  if (i.district && !DISTRICT_BY_SLUG[i.district]) e.district = "Unknown district.";
  else if (i.district && i.scope !== "IN" && DISTRICT_BY_SLUG[i.district].state !== i.scope) e.district = "District is not in the chosen state.";
  if (i.postName.trim().length < 3) e.postName = "Enter the post / exam name.";
  if (!DATE.test(i.lastDate)) e.lastDate = "Enter the last date to apply.";
  else if (i.lastDate < opts.today) e.lastDate = "Last date has already passed.";
  if (i.startDate && !DATE.test(i.startDate)) e.startDate = "Invalid date.";
  if (i.startDate && DATE.test(i.lastDate) && i.startDate > i.lastDate) e.startDate = "Start date is after the last date.";
  if (i.vacancies !== null && i.vacancies !== undefined && !(Number.isInteger(i.vacancies) && i.vacancies > 0 && i.vacancies < 1_000_000)) e.vacancies = "Enter a whole number.";
  for (const k of ["notificationUrl", "applyUrl"] as const) {
    const v = i[k];
    if (!v) { if (k === "notificationUrl") e.notificationUrl = "Paste the official notification link."; continue; }
    const r = checkOfficialUrl(v, org);
    if (!r.ok) {
      if (/valid link|https|username/.test(r.reason) || !opts.allowUnofficial) e[k] = r.reason;
    }
  }
  return e;
}

/** Turns the admin form into a RawJob for the normal pipeline (source "manual", government section). */
export function govToRaw(i: GovNotificationInput): RawJob {
  const org = GOV_ORG_BY_SLUG[i.orgSlug];
  const orgName = i.orgSlug === "other" ? i.orgName!.trim() : org.name;
  const orgShort = i.orgSlug === "other" ? "" : org.short;
  const state = i.scope === "IN" ? null : STATE_NAMES[i.scope].name;
  const dist = i.district ? DISTRICT_BY_SLUG[i.district] : null;
  const where = [dist ? `${dist.name} district` : null, state ?? "All India"].filter(Boolean).join(", ");
  const rows: Array<[string, string | number | null | undefined]> = [
    ["Recruiting organisation", orgShort ? `${orgName} (${orgShort})` : orgName],
    ["Notification number", i.notificationNo],
    ["Posts / exam", i.postName],
    ["Vacancies", i.vacancies],
    ["Location", where],
    ["Qualification", i.qualification],
    ["Age limit", i.ageLimit],
    ["Pay scale", i.salaryText],
    ["Application fee (paid only on the official website)", i.fee],
    ["Apply from", i.startDate ? fmtDate(i.startDate) : null],
    ["Last date to apply", fmtDate(i.lastDate)],
  ];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const table = rows.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `<li><strong>${esc(k)}:</strong> ${esc(String(v))}</li>`).join("");
  const details = i.details?.trim() ? `<p>${esc(i.details.trim()).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>` : "";
  const html = `<ul>${table}</ul>${details}<p><strong>How to apply:</strong> Read the official notification and apply only on the official website. Mana Kosamu does not collect applications or any fee.</p>`;
  return {
    sourceJobId: `gov-${i.id}`,
    externalUrl: i.notificationUrl,
    applyUrl: i.applyUrl || i.notificationUrl,
    title: orgShort && !new RegExp(`\\b${orgShort.replace(/\s+/g, "\\s*")}\\b`, "i").test(i.postName) ? `${i.postName} (${orgShort})` : i.postName,
    companyName: orgName,
    descriptionHtml: html,
    employmentTypeRaw: "full_time",
    locationRaw: where,
    city: null,
    state,
    country: "India",
    district: i.district || null,
    workModeHint: "onsite",
    salaryText: i.salaryText ?? null,
    postedAt: new Date(),
    expiresAt: `${i.lastDate}T23:59:59+05:30`,
    isGovernment: true,
    tags: ["government", orgShort.toLowerCase()].filter(Boolean),
  };
}
