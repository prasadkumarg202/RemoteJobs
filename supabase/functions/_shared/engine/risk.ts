// Quality / scam heuristics. These never label a company as a scam: a high score
// only routes the job to moderation and shows "Needs verification".

import type { RiskLevel } from "./types.ts";

export interface RiskInput {
  title: string;
  description: string;
  companyName: string;
  applyUrl: string | null;
  applyEmail?: string | null;
  applyWhatsapp?: string | null;
  applyPhone?: string | null;
  salaryIssues: string[];
  expiresAt: string | null;
  isDuplicate?: boolean;
  /** Third-party boards already moderate; employer submissions get stricter checks. */
  trustedSource: boolean;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  flags: string[];
}

const CHECKS: Array<{ flag: string; weight: number; re: RegExp }> = [
  { flag: "payment_required", weight: 45, re: /\b(?:pay|deposit|send)\s+(?:a\s+)?(?:small\s+)?(?:fee|amount|money|rs\.?|₹|\$)\s*(?:\d|to\s+(?:apply|join|register|start))|\bpayment\s+(?:is\s+)?required\s+to\s+(?:apply|join|start)|\brefundable\s+(?:deposit|fee)\b/i },
  { flag: "registration_fee", weight: 45, re: /\b(?:registration|joining|application|processing|onboarding|security|kit)\s+(?:fee|charges?|deposit)\b/i },
  { flag: "training_fee", weight: 35, re: /\b(?:training|certification|course)\s+(?:fee|charges?|cost)\b.{0,40}\b(?:pay|required|mandatory|₹|rs|\$)|\bpaid\s+training\s+(?:program|course)\s+(?:before|required)/i },
  { flag: "investment_required", weight: 45, re: /\b(?:invest(?:ment)?|starter\s+pack(?:age)?|buy\s+(?:our|the)\s+(?:kit|product|package))\b.{0,40}\b(?:required|needed|to\s+(?:start|join)|minimum)/i },
  { flag: "crypto_payment", weight: 25, re: /\b(?:paid|payment|salary|payout)s?\s+(?:in|via|through)\s+(?:crypto|bitcoin|btc|usdt|tether|eth(?:ereum)?)\b|\b(?:usdt|bitcoin)\s+(?:salary|payment|payout)/i },
  { flag: "misleading_income", weight: 30, re: /\b(?:earn|make|income\s+of)\s+(?:up\s+to\s+)?(?:₹|rs\.?|\$|inr|usd)\s?\d[\d,]*\s*(?:k\s*)?(?:per|a|\/)\s*(?:day|daily|hour)\b.{0,60}\b(?:no\s+experience|from\s+home|easy|simple|part[- ]time)|\b(?:guaranteed|unlimited)\s+(?:income|earnings)\b|\bget\s+rich\b|\bdaily\s+payout\b/i },
  { flag: "task_scam_pattern", weight: 30, re: /\b(?:like|rate|review)\s+(?:youtube\s+)?(?:videos?|products?|hotels?)\s+(?:and|to)\s+earn\b|\bprepaid\s+tasks?\b|\bcommission\s+per\s+(?:like|task)\b/i },
  { flag: "personal_documents_upfront", weight: 15, re: /\bsend\s+(?:your\s+)?(?:aadhaar|aadhar|pan\s+card|bank\s+details|otp|passport)\b/i },
];

const SUSPICIOUS_HOSTS = /(?:^|\.)(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|rb\.gy|is\.gd|shorturl\.at|goo\.gl|wa\.me|t\.me|telegram\.me|forms\.gle|blogspot\.com|wixsite\.com|weebly\.com|000webhostapp\.com|godaddysites\.com)$/i;
const SUSPICIOUS_TLDS = /\.(?:tk|ml|ga|cf|gq|xyz|top|click|buzz|rest|cfd|sbs|work)$/i;

export function assessRisk(input: RiskInput): RiskResult {
  const flags: string[] = [];
  let score = 0;
  const text = `${input.title}\n${input.description}`;

  for (const c of CHECKS) {
    c.re.lastIndex = 0;
    if (c.re.test(text)) { flags.push(c.flag); score += c.weight; }
  }

  const mentionsTelegram = /\btelegram\b|\bt\.me\//i.test(text) || /t\.me|telegram/i.test(input.applyUrl ?? "");
  const mentionsWhatsapp = /\bwhats\s?app\b|\bwa\.me\//i.test(text) || !!input.applyWhatsapp;
  const hasUrl = !!input.applyUrl && !/t\.me|telegram|wa\.me|whatsapp/i.test(input.applyUrl);
  const hasEmail = !!input.applyEmail || /[\w.+-]+@[\w-]+\.[\w.]+/.test(input.description);
  const hasPhone = !!input.applyPhone || /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/.test(input.description);

  if (!hasUrl && !hasEmail) {
    if (mentionsTelegram && !mentionsWhatsapp) { flags.push("telegram_only"); score += 30; }
    else if (mentionsWhatsapp && !mentionsTelegram && !hasPhone) { flags.push("whatsapp_only"); score += input.trustedSource ? 5 : 15; }
    else if (hasPhone && !mentionsWhatsapp && !mentionsTelegram) { flags.push("phone_only"); score += 15; }
    else if (mentionsTelegram && mentionsWhatsapp) { flags.push("messaging_apps_only"); score += 25; }
  }

  if (input.applyUrl) {
    try {
      const host = new URL(input.applyUrl).hostname.toLowerCase();
      if (SUSPICIOUS_HOSTS.test(host) || SUSPICIOUS_TLDS.test(host)) { flags.push("suspicious_domain"); score += 20; }
    } catch {
      flags.push("invalid_apply_url"); score += 15;
    }
  }

  const email = input.applyEmail ?? "";
  if (/@(?:gmail|yahoo|outlook|hotmail|rediffmail)\./i.test(email) && input.companyName && !/freelanc|individual|self/i.test(input.companyName)) {
    flags.push("free_email_domain"); score += 10;
  }

  if (input.salaryIssues.includes("salary_implausibly_high")) { flags.push("misleading_salary"); score += 20; }
  if (input.expiresAt && new Date(input.expiresAt).getTime() < Date.now()) { flags.push("expired"); score += 10; }
  if (input.isDuplicate) { flags.push("duplicate"); score += 5; }
  if (!input.companyName || /^(?:confidential|n\/?a|unknown|company)$/i.test(input.companyName.trim())) { flags.push("company_unknown"); score += 10; }
  if (input.description.replace(/\s+/g, " ").length < 120) { flags.push("thin_description"); score += 10; }

  // Established boards moderate their own listings; dampen generic signals for them.
  if (input.trustedSource) score = Math.round(score * 0.7);
  score = Math.min(100, score);
  const level: RiskLevel = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return { score, level, flags };
}
