// Deterministic classification: categories, skills, AI score, employment type,
// duration and seniority. AI-model classification can be layered on later.

import { CATEGORIES, type CategoryDef } from "./taxonomy.ts";
import type { AiRelevance, EmploymentType, JobDuration, Seniority } from "./types.ts";

export interface ClassifyInput {
  title: string;
  description: string; // plain text
  tags?: string[];
  categoriesRaw?: string[];
  companyName?: string;
}

export interface CategoryResult {
  category: string | null; // group slug
  subcategory: string | null; // best category slug
  matched: string[]; // all matched category slugs
  skills: string[]; // matched skill/field names for display (ordered by weight)
}

function testAny(patterns: RegExp[], text: string): boolean {
  for (const re of patterns) {
    re.lastIndex = 0;
    if (re.test(text)) return true;
  }
  return false;
}

export function classifyCategories(input: ClassifyInput): CategoryResult {
  const headText = [input.title, ...(input.tags ?? []), ...(input.categoriesRaw ?? [])].join(" \n ");
  const bodyText = input.description;
  const scored: Array<{ def: CategoryDef; score: number }> = [];

  for (const def of CATEGORIES) {
    const inHead = testAny(def.patterns, headText);
    const inBody = !def.titleOnly && !inHead && testAny(def.patterns, bodyText);
    if (!inHead && !inBody) continue;
    // Gemini the crypto exchange is a company, not the AI model.
    if (def.slug === "gemini" && /gemini/i.test(input.companyName ?? "")) continue;
    const w = def.weight ?? 1;
    scored.push({ def, score: (inHead ? 3 : 1) * w });
  }

  scored.sort((a, b) => b.score - a.score);
  const matched = scored.map((s) => s.def.slug);

  // Primary subcategory: prefer "field" kinds over "skill" kinds when scores tie closely.
  const fields = scored.filter((s) => s.def.kind === "field");
  const best = fields[0] && (!scored[0] || fields[0].score >= scored[0].score * 0.5) ? fields[0] : scored[0];

  // Group: sum scores per group.
  const groupScore = new Map<string, number>();
  for (const s of scored) groupScore.set(s.def.group, (groupScore.get(s.def.group) ?? 0) + s.score);
  let category: string | null = null;
  let top = 0;
  for (const [g, sc] of groupScore) if (sc > top) { top = sc; category = g; }
  // A primary AI subcategory wins the group if it's in the title.
  if (best && best.def.ai && best.score >= 9) category = "ai-ml";

  return {
    category,
    subcategory: best?.def.slug ?? null,
    matched,
    skills: scored.slice(0, 12).map((s) => s.def.name),
  };
}

// ── AI relevance score ────────────────────────────────────────────────────

export interface AiScoreResult {
  score: number;
  relevance: AiRelevance;
  signals: string[];
  aiCategory: string | null;
}

const TITLE_AI = /(?<![A-Za-z0-9])(AI|A\.I\.|ML|LLMs?|GenAI|Gen AI|NLP|MLOps)(?![A-Za-z0-9])|artificial intelligence|machine learning|deep learning|generative|computer vision|prompt engineer|data scientist|AI-powered|chatgpt|openai/i;
const GENAI = /generative ai|gen ?ai(?![a-z])|large language models?|(?<![A-Za-z])LLMs?(?![A-Za-z])|foundation models?|diffusion models?/i;
const CHAT_MODELS = /chatgpt|openai|gpt-?4|gpt-?5|anthropic|(?<![A-Za-z])Claude(?![A-Za-z])|google gemini|gemini (?:api|pro|flash|models?)|llama ?[23]|mistral ai/i;
const RAG = /(?<![A-Za-z])RAG(?![A-Za-z])|retrieval[- ]augmented|langchain|llamaindex|vector (?:database|db|search|store)|pinecone|weaviate|pgvector/;
const RAG_I = /retrieval[- ]augmented|langchain|llamaindex|vector (?:database|db|search|store)|pinecone|weaviate|pgvector/i;
const AGENTS = /ai agents?|agentic|autonomous agents?|multi-agent|crewai|autogen|langgraph|agent framework/i;
const PROMPT = /prompt engineer(?:ing)?|prompt design|prompt writing/i;
const AUTOMATION = /(?<![A-Za-z0-9])n8n(?![A-Za-z0-9])|zapier|make\.com|integromat|ai automation|workflow automation|no-?code automation/i;
const PYTHON = /(?<![A-Za-z])python(?![A-Za-z])/i;
const ML_TERMS = /machine learning|(?<![A-Za-z])ML(?![A-Za-z])|pytorch|tensorflow|scikit-learn|hugging ?face|deep learning|neural network|transformers? models?/;
const ML_FRAMEWORKS = /pytorch|tensorflow|keras|scikit-learn|hugging ?face|xgboost|(?<![A-Za-z])JAX(?![A-Za-z])/i;
const AI_CREATIVE = /midjourney|stable diffusion|dall[- ·]?e|runway(?:ml)?(?![a-z])|heygen|synthesia|(?<![a-z])sora(?![a-z])|elevenlabs|pika labs|text[- ]to[- ](?:image|video|speech)/i;
const ML_DESC = /machine learning|deep learning|natural language processing|computer vision|(?<![A-Za-z])NLP(?![A-Za-z])|neural networks?|model training|fine-?tun(?:e|ing)/i;

export function scoreAi(input: ClassifyInput, categoryMatches: string[] = []): AiScoreResult {
  const title = input.title;
  const desc = `${input.description}\n${(input.tags ?? []).join(" ")}`;
  const company = input.companyName ?? "";
  const signals: string[] = [];
  let raw = 0;
  const add = (pts: number, sig: string) => { raw += pts; signals.push(sig); };

  const titleIsAi = TITLE_AI.test(title);
  if (titleIsAi) add(30, "title:ai");
  // A title naming an AI tool/technique ("Build n8n workflow…", "RAG chatbot") is a strong, non-incidental signal.
  else if (CHAT_MODELS.test(title) || RAG.test(title) || RAG_I.test(title) || AGENTS.test(title) || /(?<![A-Za-z0-9])n8n(?![A-Za-z0-9])|make\.com|ai automation/i.test(title)) add(15, "title:ai_tool");
  if (GENAI.test(desc) || GENAI.test(title)) add(20, "generative_ai");
  const descNoCompany = company ? desc.split(company).join(" ") : desc;
  if (CHAT_MODELS.test(descNoCompany) || CHAT_MODELS.test(title)) add(20, "chat_models");
  if (RAG.test(desc) || RAG_I.test(desc) || RAG.test(title)) add(15, "rag");
  if (AGENTS.test(desc) || AGENTS.test(title)) add(15, "ai_agents");
  if (PROMPT.test(desc) || PROMPT.test(title)) add(10, "prompt_engineering");
  if (AUTOMATION.test(desc) || AUTOMATION.test(title)) add(10, "automation");
  if (PYTHON.test(desc) && ML_TERMS.test(desc)) add(10, "python_ml");
  // Additional signals so classic ML / data-science roles are recognized.
  if (ML_FRAMEWORKS.test(desc)) add(15, "ml_frameworks");
  if (ML_DESC.test(desc)) add(10, "ml_description");
  if (AI_CREATIVE.test(desc) || AI_CREATIVE.test(title)) add(15, "ai_creative_tools");

  let score = Math.max(0, Math.min(100, raw));

  // Guard: one passing mention in the description is not an AI job.
  const descSignals = signals.filter((s) => s !== "title:ai" && s !== "title:ai_tool");
  const titleTool = signals.includes("title:ai_tool");
  if (!titleIsAi && !titleTool && descSignals.length <= 1) score = Math.min(score, 25);
  // Without an AI title, require several independent signals to go past "AI/Automation Related".
  if (!titleIsAi && descSignals.length < 4) score = Math.min(score, 59);

  const relevance: AiRelevance =
    score >= 80 ? "strong_ai" : score >= 60 ? "ai_related" : score >= 40 ? "ai_automation" : "general";

  let aiCategory: string | null = null;
  if (score >= 40) {
    const aiCats = categoryMatches.filter((s) => {
      const def = CATEGORIES.find((c) => c.slug === s);
      return def?.ai && def.kind === "field";
    });
    const creative = categoryMatches.find((s) => s === "ai-image-generation" || s === "ai-video");
    aiCategory = aiCats[0] ?? creative ?? (signals.includes("automation") ? "ai-automation" : "ai-engineering");
  }

  return { score, relevance, signals, aiCategory };
}

// ── Employment type ───────────────────────────────────────────────────────

const ET_MAP: Array<[RegExp, EmploymentType]> = [
  [/intern/i, "internship"],
  [/free-?lanc/i, "freelance"],
  [/(?<![a-z])gig/i, "gig"],
  [/temp(?:orary)?(?![a-z])|seasonal/i, "temporary"],
  [/contract|contractor|consultant|1099|c2c|b2b/i, "contract"],
  [/part[\s_-]?time/i, "part_time"],
  [/full[\s_-]?time|permanent|employee/i, "full_time"],
];

export function classifyEmploymentType(raw: string | string[] | null | undefined, title: string, description: string): EmploymentType {
  const rawList = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const fromRaw: EmploymentType[] = [];
  for (const r of rawList) for (const [re, et] of ET_MAP) if (re.test(r)) { fromRaw.push(et); break; }

  const head = `${title}`;
  // Freelance / gig signals in title or early description beat a generic "contract" label.
  if (/\bfree-?lanc(?:e|er|ing)\b/i.test(head) || /\b(?:gig|one[- ]time (?:task|project)|fixed[- ]price project)\b/i.test(head)) {
    return /\bgig\b/i.test(head) ? "gig" : "freelance";
  }
  if (fromRaw.includes("internship")) return "internship";
  if (fromRaw.length) {
    // Prefer the most specific non-full-time label when several are listed (e.g. ["Full-Time","Contract"]).
    for (const et of ["freelance", "gig", "contract", "temporary", "part_time"] as EmploymentType[]) {
      if (fromRaw.includes(et) && !fromRaw.includes("full_time")) return et;
    }
    return fromRaw[0];
  }
  const early = description.slice(0, 1500);
  if (/\binternship\b|\bintern\b/i.test(head)) return "internship";
  if (/\bfree-?lance(?:r|rs)?\b|\bper project\b|\bproject[- ]based\b|\bfixed[- ]price\b/i.test(early)) return "freelance";
  if (/\bpart[- ]time\b/i.test(head) || /\bthis is a part[- ]time\b/i.test(early)) return "part_time";
  if (/\bcontract(?:or)?\b/i.test(head) || /\b(?:\d+[- ]month )?contract (?:role|position|engagement)\b/i.test(early)) return "contract";
  return "full_time";
}

// ── Duration ──────────────────────────────────────────────────────────────

export function classifyDuration(text: string, employmentType: EmploymentType): JobDuration {
  const t = text.toLowerCase();
  if (/\bone[- ]time (?:task|project|job|gig)\b|\bsingle (?:task|deliverable)\b/.test(t)) return "one_time";
  if (/\b(?:ongoing|long[- ]term|indefinite|retainer|permanent)\b/.test(t) && employmentType !== "gig") {
    if (employmentType !== "full_time") return "ongoing";
  }
  const m = t.match(/(\d+)\s*(?:\+|or more)?\s*(?:-|–|to)?\s*(\d+)?\s*(day|week|month|year)s?\b(?![- ]old)/);
  if (m && /(?:contract|project|engagement|duration|gig|freelance|for|lasting|length|timeline|deliver)/.test(t.slice(Math.max(0, (m.index ?? 0) - 80), (m.index ?? 0) + 60))) {
    const hi = Number(m[2] ?? m[1]);
    const unit = m[3];
    const months = unit === "day" ? hi / 30 : unit === "week" ? hi / 4.345 : unit === "month" ? hi : hi * 12;
    if (/\+|or more/.test(m[0]) && months >= 6) return "6_plus_months";
    if (months < 1) return "less_than_1_month";
    if (months <= 3) return "1_to_3_months";
    if (months <= 6) return "3_to_6_months";
    return "6_plus_months";
  }
  if (employmentType === "full_time" || employmentType === "part_time") return "ongoing";
  return "unknown";
}

// ── Seniority & experience ───────────────────────────────────────────────

export function classifySeniority(raw: string | null | undefined, title: string, description: string): {
  seniority: Seniority; experienceMin: number | null; experienceMax: number | null;
} {
  let seniority: Seniority = "any";
  const r = `${raw ?? ""} ${title}`.toLowerCase();
  if (/\b(principal|staff|lead|head of|director|vp|chief|architect|manager)\b/.test(r)) seniority = "lead";
  else if (/\b(senior|sr\.?|expert|iii)\b/.test(r)) seniority = "senior";
  else if (/\b(mid|midweight|intermediate|ii)\b/.test(r)) seniority = "mid";
  else if (/\b(junior|jr\.?|entry|graduate|trainee|fresher|intern|associate|beginner)\b/.test(r)) seniority = "entry";

  let experienceMin: number | null = null;
  let experienceMax: number | null = null;
  const m = description.match(/(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)?\s*(\d{1,2})?\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+\w+){0,4}\s+(?:experience|exp\b)/i);
  if (m) {
    const lo = Number(m[1]);
    const hi = m[2] ? Number(m[2]) : null;
    if (lo <= 30 && (hi === null || (hi >= lo && hi <= 40))) {
      experienceMin = lo;
      experienceMax = hi;
    }
  } else if (/\bfresher|no experience (?:required|needed)\b/i.test(description)) {
    experienceMin = 0;
    experienceMax = 1;
  }
  if (seniority === "any" && experienceMin !== null) {
    seniority = experienceMin <= 1 ? "entry" : experienceMin <= 4 ? "mid" : experienceMin <= 8 ? "senior" : "lead";
  }
  return { seniority, experienceMin, experienceMax };
}
