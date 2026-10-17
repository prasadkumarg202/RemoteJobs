// Section presets and SEO landing pages. Only a curated set of topic pages
// exists (no auto-generated thin pages), and pages with too few live jobs are noindex.

import type { Metadata } from "next";
import { SITE_URL } from "@/lib/env";
import type { FilterGroup } from "@/components/FilterPanel";
import type { SectionKey } from "@/components/SectionTabs";
import type { JobFilters } from "./types";

export const MIN_JOBS_TO_INDEX = 3;

export interface PagePreset {
  path: string;
  section: SectionKey;
  filters: JobFilters;
  title: string;
  description: string;
  heroKey: "remoteHero" | "aiHero" | "freelanceHero" | "wfhHero" | "govHero" | "localHero" | null;
  subKey: "remoteHeroSub" | "aiHeroSub" | "freelanceHeroSub" | "wfhHeroSub" | "govHeroSub" | "localHeroSub" | null;
  heading?: string;
  groups: FilterGroup[];
  card: "job" | "gig";
  indiaToggle: boolean;
  defaultIndia?: "eligible" | "india_only";
  emptyKey?: "govEmpty" | "localEmpty";
  /** Show "More jobs from Careerjet" under the results. */
  careerjet?: boolean;
}

const REMOTE_GROUPS: FilterGroup[] = ["country", "region", "category", "skill", "experience", "salary", "type", "posted"];
const AI_GROUPS: FilterGroup[] = ["aiCategory", "skill", "experience", "salary", "type", "country", "posted"];
const FREELANCE_GROUPS: FilterGroup[] = ["skill", "budget", "duration", "category", "experience", "country", "posted"];

export const PRESETS: Record<string, PagePreset> = {
  remote: {
    path: "/jobs/remote", section: "remote", filters: { sections: ["remote"] }, heroKey: "remoteHero", subKey: "remoteHeroSub",
    title: "Remote jobs you can apply for from India", description: "Remote jobs from trusted job boards, with clear eligibility: worldwide, India, APAC or timezone-based. Updated several times a day.",
    groups: REMOTE_GROUPS, card: "job", indiaToggle: true,
  },
  "remote/india": {
    path: "/jobs/remote/india", section: "remote", filters: { sections: ["remote"] }, defaultIndia: "eligible", heroKey: null, subKey: "remoteHeroSub",
    heading: "Remote jobs open to candidates in India",
    title: "Remote jobs in India — open to Indian candidates", description: "Only remote jobs whose source confirms candidates in India can apply: India-specific, APAC, IST-timezone and worldwide roles.",
    groups: REMOTE_GROUPS, card: "job", indiaToggle: true,
  },
  ai: {
    path: "/jobs/ai", section: "ai", filters: { sections: ["ai"] }, heroKey: "aiHero", subKey: "aiHeroSub",
    title: "AI jobs & remote AI careers", description: "Generative AI, LLM, machine learning, AI automation and prompt engineering jobs — scored for real AI relevance, with India eligibility checked.",
    groups: AI_GROUPS, card: "job", indiaToggle: true,
  },
  "ai/remote": {
    path: "/jobs/ai/remote", section: "ai", filters: { sections: ["ai", "remote"] }, heroKey: null, subKey: "aiHeroSub", heading: "Remote AI jobs",
    title: "Remote AI jobs — LLM, ML and Generative AI", description: "Remote AI engineering, machine learning and generative AI roles from trusted job boards.",
    groups: AI_GROUPS, card: "job", indiaToggle: true,
  },
  "ai/india": {
    path: "/jobs/ai/india", section: "ai", filters: { sections: ["ai"] }, defaultIndia: "eligible", heroKey: null, subKey: "aiHeroSub", heading: "AI jobs open to India",
    title: "AI jobs for candidates in India", description: "AI, machine learning and generative AI roles open to candidates based in India — remote and on-site.",
    groups: AI_GROUPS, card: "job", indiaToggle: true,
  },
  freelance: {
    path: "/jobs/freelance", section: "freelance", filters: { sections: ["freelance"] }, heroKey: "freelanceHero", subKey: "freelanceHeroSub",
    title: "AI & freelance gigs — remote projects", description: "Freelance, contract and gig work: AI automation, ChatGPT, n8n, Python, web development, SEO, content, video editing and design.",
    groups: FREELANCE_GROUPS, card: "gig", indiaToggle: false,
  },
  "work-from-home": {
    path: "/jobs/work-from-home", section: "wfh", filters: { sections: ["wfh"] }, heroKey: "wfhHero", subKey: "wfhHeroSub",
    title: "Work from home jobs in India", description: "Part-time, freelance and remote work you can do from home in India: virtual assistant, data entry, content writing, support and more.",
    groups: ["category", "type", "salary", "experience", "posted"], card: "job", indiaToggle: false,
  },
  government: {
    path: "/jobs/government", section: "government", filters: { sections: ["government"] }, heroKey: "govHero", subKey: "govHeroSub", emptyKey: "govEmpty",
    title: "Government jobs — official notifications", description: "Government job notifications with links to the official websites.",
    groups: ["state", "district", "experience", "posted"], card: "job", indiaToggle: false,
  },
  local: {
    path: "/jobs/local", section: "local", filters: { sections: ["local"] }, heroKey: "localHero", subKey: "localHeroSub", emptyKey: "localEmpty",
    title: "Local jobs in Andhra Pradesh & Telangana", description: "Jobs posted directly by local businesses in Hyderabad, Vijayawada, Visakhapatnam and across AP & Telangana.",
    groups: ["state", "district", "category", "type", "experience", "salary", "mode", "posted"], card: "job", indiaToggle: false,
  },
};

/** Curated topic landing pages: /jobs/<topic>. */
export const TOPICS: Record<string, { name: string; filters: JobFilters; blurb: string }> = {
  chatgpt: { name: "ChatGPT", filters: { categories: ["chatgpt"] }, blurb: "Jobs and gigs that use ChatGPT and the OpenAI API." },
  claude: { name: "Claude", filters: { categories: ["claude"] }, blurb: "Jobs building with Anthropic’s Claude models." },
  n8n: { name: "n8n", filters: { categories: ["n8n"] }, blurb: "Workflow automation jobs and freelance gigs with n8n." },
  python: { name: "Python", filters: { categories: ["python"] }, blurb: "Python developer, data and AI jobs." },
  sql: { name: "SQL", filters: { categories: ["sql"] }, blurb: "SQL developer, DBA and data analyst jobs." },
  azure: { name: "Azure", filters: { categories: ["azure"] }, blurb: "Microsoft Azure cloud, data and DevOps jobs." },
  aws: { name: "AWS", filters: { categories: ["aws"] }, blurb: "AWS cloud engineering and DevOps jobs." },
  react: { name: "React", filters: { categories: ["react"] }, blurb: "React and front-end developer jobs." },
  "power-bi": { name: "Power BI", filters: { categories: ["power-bi"] }, blurb: "Power BI, dashboards and business intelligence work." },
  "machine-learning": { name: "Machine Learning", filters: { categories: ["machine-learning"] }, blurb: "Machine learning engineer and ML ops jobs." },
  "generative-ai": { name: "Generative AI", filters: { categories: ["generative-ai", "llm"] }, blurb: "Generative AI and LLM engineering jobs." },
  "prompt-engineering": { name: "Prompt Engineering", filters: { categories: ["prompt-engineering"] }, blurb: "Prompt engineering and AI evaluation roles." },
  "ai-agents": { name: "AI Agents", filters: { categories: ["ai-agents"] }, blurb: "Jobs building AI agents and agentic workflows." },
  "data-entry": { name: "Data Entry", filters: { categories: ["data-entry"] }, blurb: "Data entry jobs and gigs — always check that no fee is asked." },
  "video-editing": { name: "Video Editing", filters: { categories: ["video-editing"] }, blurb: "Video editing jobs and freelance gigs — YouTube, Shorts, Reels." },
  "virtual-assistant": { name: "Virtual Assistant", filters: { categories: ["virtual-assistant"] }, blurb: "Virtual assistant and admin support roles." },
  "content-writing": { name: "Content Writing", filters: { categories: ["content-writing"] }, blurb: "Content writing, copywriting and technical writing work." },
  devops: { name: "DevOps", filters: { categories: ["devops"] }, blurb: "DevOps, SRE and platform engineering jobs." },
};

export function pageMetadata({ title, description, path, noindex = false }: { title: string; description: string; path: string; noindex?: boolean }): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "Mana Kosamu", type: "website", locale: "en_IN" },
    twitter: { card: "summary", title, description },
    robots: noindex ? { index: false, follow: true } : undefined,
  };
}
