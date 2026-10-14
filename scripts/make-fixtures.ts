// Builds realistic source payloads (shapes per each source's documented API) for
// tests and the offline demo. Companies are fictional.
//   npx tsx scripts/make-fixtures.ts

import { mkdirSync, writeFileSync } from "node:fs";

type Kind = "ai" | "freelance" | "general";
interface Spec {
  title: string; company: string; kind: Kind; loc: string; countries?: string[]; tz?: number[];
  salary?: [number, number, string, string]; type: string; tags: string[]; extra?: string; level?: string; daysAgo: number;
}

const P = {
  intro: (c: string) => `<p>${c} is a remote-first team building software used by customers in more than 40 countries.</p>`,
  ai: `<p>You will design, build and ship production features powered by large language models (LLMs) and Generative AI. Day to day you will work with the OpenAI and Anthropic Claude APIs, build retrieval-augmented generation (RAG) pipelines with LangChain and a vector database (pgvector / Pinecone), and evaluate prompts systematically.</p><ul><li>Build AI agents that call internal tools</li><li>Own prompt engineering and evaluation</li><li>Write clean Python and TypeScript</li></ul>`,
  ml: `<p>You will train and deploy machine learning models using Python, PyTorch and scikit-learn, own feature pipelines, and monitor models in production (MLOps).</p>`,
  automation: `<p>We automate business workflows with n8n, Zapier and Make.com, connecting CRMs, WhatsApp Business and Google Sheets. Experience integrating ChatGPT into automations is a plus.</p>`,
  general: `<p>You will collaborate with product and design, write well-tested code, review pull requests and help us keep a calm, sustainable pace.</p><ul><li>Strong communication in English</li><li>Ownership mindset</li></ul>`,
  benefits: `<p>Benefits: flexible hours, home-office budget, learning stipend and paid time off.</p>`,
};

const S: Spec[] = [
  // ── AI (strong) ──
  { title: "Senior AI Engineer (LLM & RAG)", company: "Lumora Labs", kind: "ai", loc: "Worldwide", salary: [120000, 160000, "USD", "annual"], type: "Full Time", tags: ["ai", "llm", "python"], level: "Senior", daysAgo: 0 },
  { title: "Generative AI Engineer", company: "Kestrel Health", kind: "ai", loc: "USA", countries: ["United States"], salary: [140000, 185000, "USD", "annual"], type: "Full Time", tags: ["genai", "python"], extra: "<p>Candidates must be located in the United States and authorized to work in the US.</p>", daysAgo: 1 },
  { title: "Machine Learning Engineer", company: "Tidewave Analytics", kind: "ai", loc: "APAC", salary: [45000, 70000, "USD", "annual"], type: "Full Time", tags: ["machine learning", "pytorch"], level: "Midweight", daysAgo: 2 },
  { title: "LLM Prompt Engineer", company: "Quillstack", kind: "ai", loc: "Anywhere", salary: [40, 70, "USD", "hourly"], type: "Contract", tags: ["prompt engineering", "chatgpt", "claude"], extra: "<p>This is a 3 month contract with possible extension.</p>", daysAgo: 0 },
  { title: "AI Agents Developer (LangGraph)", company: "Orbitflow", kind: "ai", loc: "India", countries: ["India"], salary: [2400000, 4000000, "INR", "annual"], type: "Full Time", tags: ["ai agents", "langgraph", "python"], daysAgo: 3 },
  { title: "Applied AI Scientist – NLP", company: "Verbatim AI", kind: "ai", loc: "Europe", salary: [90000, 120000, "EUR", "annual"], type: "Full Time", tags: ["nlp", "hugging face"], daysAgo: 4 },
  { title: "Computer Vision Engineer", company: "Pixelfield Robotics", kind: "ai", loc: "Canada, USA", countries: ["Canada", "United States"], salary: [130000, 170000, "USD", "annual"], type: "Full Time", tags: ["computer vision", "opencv", "pytorch"], daysAgo: 5 },
  { title: "Data Scientist (GenAI)", company: "Brightledger", kind: "ai", loc: "Worldwide", type: "Full Time", tags: ["data science", "llm"], level: "Entry", daysAgo: 6, extra: "<p>Graduates welcome — 0-2 years experience.</p>" },
  { title: "AI Automation Specialist (n8n + ChatGPT)", company: "Flowcraft Studio", kind: "ai", loc: "Worldwide", salary: [25, 45, "USD", "hourly"], type: "Freelance", tags: ["n8n", "ai automation", "chatgpt"], extra: P.automation, daysAgo: 0 },
  { title: "MLOps Engineer", company: "Granite Signal", kind: "ai", loc: "EMEA", salary: [85000, 110000, "GBP", "annual"], type: "Full Time", tags: ["mlops", "kubernetes"], daysAgo: 7 },
  { title: "AI Product Engineer (Claude API)", company: "Northwind Notes", kind: "ai", loc: "", tz: [3, 4, 5, 6, 7], salary: [70000, 95000, "USD", "annual"], type: "Full Time", tags: ["claude", "typescript"], daysAgo: 1 },
  { title: "Junior ML Engineer", company: "Sunpath Energy", kind: "ai", loc: "India, Singapore", countries: ["India", "Singapore"], salary: [1200000, 1800000, "INR", "annual"], type: "Full Time", tags: ["ml", "python"], level: "Entry", daysAgo: 2 },
  { title: "RAG Engineer – Contract", company: "Docuverse", kind: "ai", loc: "Worldwide", salary: [50, 80, "USD", "hourly"], type: "Contract", tags: ["rag", "langchain"], extra: "<p>Project duration: 6 weeks.</p>", daysAgo: 3 },
  { title: "AI Video Creator (Runway, HeyGen)", company: "Reelcraft Media", kind: "ai", loc: "Anywhere", salary: [500, 1500, "USD", "project"], type: "Freelance", tags: ["ai video", "video editing"], extra: "<p>One-time project: 10 short explainer videos made with HeyGen and Runway.</p>", daysAgo: 1 },
  { title: "AI Image Generation Artist (Midjourney)", company: "Pinecrest Books", kind: "ai", loc: "Worldwide", salary: [300, 900, "USD", "project"], type: "Freelance", tags: ["midjourney", "ai art"], extra: "<p>Create 20 book cover concepts with Midjourney and Stable Diffusion. Timeline 2 weeks.</p>", daysAgo: 2 },
  { title: "Copilot Studio Developer", company: "Harbor Systems", kind: "ai", loc: "UK", countries: ["United Kingdom"], salary: [400, 550, "GBP", "daily"], type: "Contract", tags: ["copilot", "azure", "power automate"], daysAgo: 4, extra: "<p>Builds AI copilots with Microsoft Copilot Studio and Azure OpenAI.</p>" },
  { title: "Senior Deep Learning Researcher", company: "Atlas Vision", kind: "ai", loc: "Worldwide", salary: [150000, 210000, "USD", "annual"], type: "Full Time", tags: ["deep learning"], daysAgo: 8 },
  { title: "AI Chatbot Developer – WhatsApp", company: "Bazaarline", kind: "ai", loc: "India", countries: ["India"], salary: [60000, 120000, "INR", "project"], type: "Freelance", tags: ["chatgpt", "whatsapp", "n8n"], extra: "<p>Build a WhatsApp AI assistant with n8n and the OpenAI API. Expected timeline: 3 weeks.</p>", daysAgo: 0 },
  { title: "Gemini API Integration Engineer", company: "Cobalt Commerce", kind: "ai", loc: "APAC, EMEA", salary: [60000, 85000, "USD", "annual"], type: "Full Time", tags: ["gemini", "vertex ai"], extra: "<p>Integrate Google Gemini API and Vertex AI into our search.</p>", daysAgo: 5 },
  { title: "AI Engineer (Python, OpenAI)", company: "Lumora Labs", kind: "ai", loc: "Worldwide", salary: [110000, 150000, "USD", "annual"], type: "Full Time", tags: ["ai", "python"], daysAgo: 9 },
  { title: "Conversational AI Designer", company: "Helio Care", kind: "ai", loc: "LATAM", salary: [40000, 60000, "USD", "annual"], type: "Full Time", tags: ["nlp", "chatgpt"], daysAgo: 6 },
  { title: "AI Data Annotation Specialist (Part-time)", company: "Labelwise", kind: "ai", loc: "Worldwide", salary: [8, 15, "USD", "hourly"], type: "Part Time", tags: ["ai training data", "data entry"], extra: "<p>Help train large language models by rating and writing responses. Part-time, flexible hours.</p>", level: "Entry", daysAgo: 1 },

  // ── Freelance / gigs ──
  { title: "Freelance React Developer – Dashboard", company: "Mintleaf", kind: "freelance", loc: "Worldwide", salary: [30, 50, "USD", "hourly"], type: "Freelance", tags: ["react", "typescript"], extra: "<p>Freelance engagement, 1-2 months, ~20 hours per week.</p>", daysAgo: 0 },
  { title: "WordPress Landing Page (one-time project)", company: "Cafe Aroma", kind: "freelance", loc: "India", countries: ["India"], salary: [15000, 30000, "INR", "project"], type: "Freelance", tags: ["wordpress", "web development"], extra: "<p>One-time project to build a 5-section landing page.</p>", daysAgo: 1 },
  { title: "YouTube Shorts Video Editor", company: "Creator Collective", kind: "freelance", loc: "Anywhere", salary: [20, 40, "USD", "project"], type: "Freelance", tags: ["video editing", "youtube shorts", "capcut"], extra: "<p>Edit 30 Shorts per month. Ongoing work for the right editor.</p>", daysAgo: 0 },
  { title: "Instagram Reels Editor (Telugu content)", company: "Tollywood Buzz", kind: "freelance", loc: "India", countries: ["India"], salary: [8000, 20000, "INR", "monthly"], type: "Part Time", tags: ["reels", "video editing", "telugu"], daysAgo: 2 },
  { title: "Graphic Designer – Canva Social Posts", company: "Spice Route Foods", kind: "freelance", loc: "Worldwide", salary: [15, 25, "USD", "hourly"], type: "Freelance", tags: ["canva", "graphic design"], daysAgo: 3 },
  { title: "Virtual Assistant (Part-time, IST hours)", company: "Peakline Consulting", kind: "freelance", loc: "", tz: [5.5], salary: [400, 700, "USD", "monthly"], type: "Part Time", tags: ["virtual assistant", "excel"], level: "Entry", daysAgo: 1 },
  { title: "Data Entry Operator – Product Catalog", company: "Shopverse", kind: "freelance", loc: "India", countries: ["India"], salary: [10000, 15000, "INR", "monthly"], type: "Contract", tags: ["data entry", "excel"], level: "Entry", extra: "<p>3 month contract. Freshers can apply.</p>", daysAgo: 0 },
  { title: "SEO Content Writer (Freelance)", company: "Wordsmith Hub", kind: "freelance", loc: "Worldwide", salary: [0.05, 0.1, "USD", "word"], type: "Freelance", tags: ["seo", "content writing"], daysAgo: 4 },
  { title: "Technical Writer – API docs", company: "Stackmint", kind: "freelance", loc: "Europe, India", countries: ["India"], salary: [3000, 6000, "EUR", "project"], type: "Contract", tags: ["technical writing"], extra: "<p>Project-based: rewrite our API reference over 4 weeks.</p>", daysAgo: 5 },
  { title: "Telugu Translator (English → Telugu)", company: "Lingua Bridge", kind: "freelance", loc: "Worldwide", salary: [0.04, 0.08, "USD", "word"], type: "Freelance", tags: ["translation", "telugu"], daysAgo: 2 },
  { title: "Power BI Dashboard Developer (gig)", company: "Retail Metrics", kind: "freelance", loc: "Worldwide", salary: [600, 1200, "USD", "project"], type: "Freelance", tags: ["power bi", "sql"], extra: "<p>Gig: one dashboard, delivery within 2 weeks.</p>", daysAgo: 1 },
  { title: "SQL DBA – Contract (Remote)", company: "Datapulse", kind: "freelance", loc: "USA", countries: ["United States"], salary: [70, 95, "USD", "hourly"], type: "Contract", tags: ["sql server", "dba"], extra: "<p>6 month contract. Must be based in the US.</p>", daysAgo: 3 },
  { title: "Zapier Expert to Automate CRM", company: "Brightdesk", kind: "freelance", loc: "Worldwide", salary: [300, 800, "USD", "project"], type: "Freelance", tags: ["zapier", "automation"], extra: "<p>Fixed-price project to connect HubSpot, Gmail and Slack with Zapier.</p>", daysAgo: 0 },
  { title: "Shopify Store Setup (Freelancer)", company: "Handloom House", kind: "freelance", loc: "India", countries: ["India"], salary: [20000, 45000, "INR", "project"], type: "Freelance", tags: ["shopify", "web development"], daysAgo: 6 },
  { title: "Customer Support Agent – Chat (Part-time)", company: "Trailmate", kind: "freelance", loc: "APAC", salary: [5, 8, "USD", "hourly"], type: "Part Time", tags: ["customer support"], level: "Entry", daysAgo: 2 },
  { title: "Python Scraper Maintenance (contract)", company: "Pricewatch", kind: "freelance", loc: "Worldwide", salary: [25, 35, "USD", "hourly"], type: "Contract", tags: ["python"], extra: "<p>Ongoing contract, 10 hours a week.</p>", daysAgo: 4 },
  { title: "Logo & Brand Identity Designer", company: "Greenleaf Farms", kind: "freelance", loc: "Worldwide", salary: [200, 500, "USD", "project"], type: "Freelance", tags: ["logo design", "graphic design"], daysAgo: 7 },
  { title: "Market Research Analyst (Freelance)", company: "Insightloop", kind: "freelance", loc: "Worldwide", salary: [20, 30, "USD", "hourly"], type: "Freelance", tags: ["research"], daysAgo: 3 },
  { title: "Excel VBA Automation Gig", company: "Ledgerly", kind: "freelance", loc: "Worldwide", salary: [150, 400, "USD", "project"], type: "Freelance", tags: ["excel", "vba"], extra: "<p>Small gig: automate a monthly report. Less than 1 week.</p>", daysAgo: 1 },

  // ── General remote tech ──
  { title: "Senior Backend Engineer (Node.js)", company: "Parcelpoint", kind: "general", loc: "Worldwide", salary: [100000, 140000, "USD", "annual"], type: "Full Time", tags: ["node.js", "postgres"], level: "Senior", daysAgo: 0 },
  { title: "Frontend Engineer (React/Next.js)", company: "Cloudnest", kind: "general", loc: "Europe", salary: [60000, 80000, "EUR", "annual"], type: "Full Time", tags: ["react", "next.js"], daysAgo: 1 },
  { title: "DevOps Engineer (Kubernetes, Terraform)", company: "Stratos Cloud", kind: "general", loc: "India", countries: ["India"], salary: [1800000, 3000000, "INR", "annual"], type: "Full Time", tags: ["devops", "kubernetes", "terraform", "aws"], daysAgo: 2 },
  { title: "Azure Cloud Engineer", company: "Bluepeak IT", kind: "general", loc: "APAC", salary: [50000, 75000, "USD", "annual"], type: "Full Time", tags: ["azure", "terraform"], daysAgo: 3 },
  { title: ".NET Developer (C#)", company: "Ledgerline", kind: "general", loc: "USA", countries: ["United States"], salary: [110000, 135000, "USD", "annual"], type: "Full Time", tags: [".net", "c#", "sql server"], daysAgo: 4 },
  { title: "Java Spring Boot Developer", company: "Finverse", kind: "general", loc: "Worldwide", type: "Full Time", tags: ["java", "spring boot"], daysAgo: 5 },
  { title: "Full Stack Developer (TypeScript)", company: "Mintleaf", kind: "general", loc: "Worldwide", salary: [70000, 95000, "USD", "annual"], type: "Full Time", tags: ["typescript", "react", "node.js"], daysAgo: 2 },
  { title: "Site Reliability Engineer", company: "Parcelpoint", kind: "general", loc: "EMEA", salary: [90000, 120000, "USD", "annual"], type: "Full Time", tags: ["sre", "gcp"], daysAgo: 6 },
  { title: "Product Designer (Figma)", company: "Calmwave", kind: "general", loc: "Worldwide", salary: [70000, 90000, "USD", "annual"], type: "Full Time", tags: ["figma", "design"], daysAgo: 3 },
  { title: "Data Engineer (Snowflake, Airflow)", company: "Tidewave Analytics", kind: "general", loc: "LATAM", salary: [55000, 80000, "USD", "annual"], type: "Full Time", tags: ["data engineering", "airflow", "snowflake"], daysAgo: 8 },
  { title: "QA Automation Engineer", company: "Testwell", kind: "general", loc: "Worldwide", salary: [45000, 65000, "USD", "annual"], type: "Full Time", tags: ["test automation", "playwright"], extra: "<p>Own our test automation suite.</p>", daysAgo: 2 },
  { title: "Customer Success Manager", company: "Calmwave", kind: "general", loc: "USA, Canada", countries: ["United States", "Canada"], salary: [65000, 80000, "USD", "annual"], type: "Full Time", tags: ["customer success"], daysAgo: 4 },
  { title: "Technical Support Engineer (IST shift)", company: "Helpdeskly", kind: "general", loc: "India", countries: ["India"], salary: [600000, 900000, "INR", "annual"], type: "Full Time", tags: ["customer support", "sql"], daysAgo: 1 },
  { title: "Python Developer (Django)", company: "Agrinet", kind: "general", loc: "Asia", salary: [30000, 45000, "USD", "annual"], type: "Full Time", tags: ["python", "django"], daysAgo: 5 },
  { title: "Mobile Developer (React Native)", company: "Fitloop", kind: "general", loc: "Worldwide", salary: [60000, 85000, "USD", "annual"], type: "Full Time", tags: ["react native"], daysAgo: 7 },
  { title: "Engineering Manager", company: "Cloudnest", kind: "general", loc: "Europe", salary: [110000, 140000, "EUR", "annual"], type: "Full Time", tags: ["management"], daysAgo: 10 },
  { title: "Head of Growth Marketing", company: "Fitloop", kind: "general", loc: "Worldwide", type: "Full Time", tags: ["marketing", "seo"], daysAgo: 12 },
  { title: "Security Engineer (AWS)", company: "Vaultline", kind: "general", loc: "USA", countries: ["United States"], salary: [150000, 190000, "USD", "annual"], type: "Full Time", tags: ["security", "aws"], extra: "<p>US citizens only; requires security clearance.</p>", daysAgo: 3 },
  { title: "Golang Engineer", company: "Streamyard Tools", kind: "general", loc: "Worldwide", salary: [90000, 125000, "USD", "annual"], type: "Full Time", tags: ["go"], daysAgo: 9, extra: "<p>We use AI tools like GitHub Copilot day to day.</p>" },
  { title: "Senior PHP Developer (Laravel)", company: "Bookly", kind: "general", loc: "Worldwide", salary: [50000, 70000, "USD", "annual"], type: "Full Time", tags: ["php", "laravel"], daysAgo: 11 },
  { title: "Salesforce Developer", company: "Cloudforge", kind: "general", loc: "India, APAC", countries: ["India"], salary: [1500000, 2500000, "INR", "annual"], type: "Full Time", tags: ["salesforce"], daysAgo: 4 },
  { title: "Expired listing: Ruby Developer", company: "Oldtown Apps", kind: "general", loc: "Worldwide", type: "Full Time", tags: ["ruby"], daysAgo: 40 },
];

const now = Date.now();
const iso = (days: number) => new Date(now - days * 86400000 - 3600000).toISOString();
const describe = (s: Spec) =>
  P.intro(s.company) +
  (s.kind === "ai" ? (/machine learning|ml engineer|deep learning|computer vision|mlops|data scientist/i.test(s.title) ? P.ml : /automation|n8n|zapier|chatbot/i.test(s.title) ? P.automation : /video|image/i.test(s.title) ? "" : P.ai) : s.kind === "freelance" ? "" : P.general) +
  (s.extra ?? "") + P.benefits;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Distribute: Himalayas gets every 3rd, Jobicy every 3rd+1, Remote OK every 3rd+2.
const himalayas: unknown[] = [];
const jobicy: unknown[] = [];
const remoteok: unknown[] = [{ legal: "API Terms of Service: Please link back to the URL on Remote OK and mention Remote OK as a source, so we get traffic back from your site." }];

S.forEach((s, i) => {
  const sl = slug(`${s.title}-${s.company}`);
  const period = s.salary?.[3];
  const validPeriod = period && period !== "word";
  const expired = s.title.startsWith("Expired");
  if (i % 3 === 0) {
    himalayas.push({
      title: s.title, excerpt: `${s.company} is hiring: ${s.title}.`, companyName: s.company, companySlug: slug(s.company),
      companyLogo: i % 5 === 0 ? null : `https://cdn.example.com/logos/${slug(s.company)}.png`,
      employmentType: s.type, minSalary: validPeriod ? s.salary![0] : null, maxSalary: validPeriod ? s.salary![1] : null,
      salaryPeriod: validPeriod ? (period === "annual" ? "annual" : period) : undefined, currency: s.salary?.[2] ?? "USD",
      seniority: s.level ? [s.level === "Midweight" ? "Mid-level" : s.level === "Entry" ? "Entry-level" : s.level] : [],
      locationRestrictions: s.countries ?? (s.loc && !/worldwide|anywhere/i.test(s.loc) ? s.loc.split(/,\s*/) : []),
      timezoneRestriction: s.tz ?? [], category: s.tags.slice(0, 2), parentCategories: [s.kind === "ai" ? "AI" : "Engineering"],
      description: describe(s), pubDate: Math.floor(new Date(iso(s.daysAgo)).getTime() / 1000),
      expiryDate: Math.floor((new Date(iso(s.daysAgo)).getTime() + (expired ? 20 : 45) * 86400000) / 1000),
      applicationLink: `https://jobs.${slug(s.company)}.example/apply/${sl}`, guid: `https://himalayas.app/companies/${slug(s.company)}/jobs/${sl}`,
    });
  } else if (i % 3 === 1) {
    jobicy.push({
      id: 120000 + i, url: `https://jobicy.com/jobs/${120000 + i}-${sl}`, jobSlug: sl, jobTitle: s.title, companyName: s.company,
      companyLogo: i % 4 === 0 ? undefined : `https://jobicy.com/data/logos/${slug(s.company)}.webp`,
      jobIndustry: [s.kind === "ai" ? "Data Science &amp; Analytics" : s.kind === "freelance" ? "Copywriting" : "Software Engineering"],
      jobType: [s.type === "Full Time" ? "full-time" : s.type === "Part Time" ? "part-time" : s.type.toLowerCase()],
      jobGeo: s.loc || "Anywhere", jobLevel: s.level ?? "Any", jobExcerpt: `${s.company} is looking for a ${s.title}.`,
      jobDescription: describe(s), pubDate: iso(s.daysAgo).replace("T", " ").slice(0, 19),
      ...(validPeriod ? { salaryMin: s.salary![0], salaryMax: s.salary![1], salaryCurrency: s.salary![2], salaryPeriod: period === "annual" ? "yearly" : period } : {}),
    });
  } else {
    remoteok.push({
      slug: `remote-${sl}-${900000 + i}`, id: String(900000 + i), epoch: Math.floor(new Date(iso(s.daysAgo)).getTime() / 1000), date: iso(s.daysAgo),
      company: s.company, company_logo: i % 6 === 0 ? "" : `https://remoteok.com/assets/img/jobs/${slug(s.company)}.png`, position: s.title,
      tags: s.type === "Full Time" ? s.tags : [...s.tags, s.type.toLowerCase()], description: describe(s), location: s.loc || "Remote",
      salary_min: period === "annual" && s.salary![2] === "USD" ? s.salary![0] : 0, salary_max: period === "annual" && s.salary![2] === "USD" ? s.salary![1] : 0,
      apply_url: `https://remoteok.com/remote-jobs/${900000 + i}/apply`, url: `https://remoteok.com/remote-jobs/remote-${sl}-${900000 + i}`,
    });
  }
});

// Cross-posted duplicates: the same Lumora Labs and Flowcraft roles also appear on other boards.
const lumora = S[0];
jobicy.push({ id: 130001, url: "https://jobicy.com/jobs/130001-senior-ai-engineer-llm-rag", jobTitle: "Senior AI Engineer (LLM & RAG) – Remote", companyName: "Lumora Labs Inc.", jobIndustry: ["Data Science"], jobType: ["full-time"], jobGeo: "Anywhere", jobLevel: "Senior", jobExcerpt: "Lumora Labs is hiring.", jobDescription: describe(lumora), pubDate: iso(0).replace("T", " ").slice(0, 19), salaryMin: 120000, salaryMax: 160000, salaryCurrency: "USD", salaryPeriod: "yearly" });
remoteok.push({ slug: "remote-senior-ai-engineer-lumora-labs-999001", id: "999001", epoch: Math.floor(now / 1000) - 7200, company: "Lumora Labs", company_logo: "https://remoteok.com/assets/img/jobs/lumora.png", position: "Sr. AI Engineer (LLM & RAG)", tags: ["ai", "llm"], description: describe(lumora), location: "Worldwide", salary_min: 120000, salary_max: 160000, apply_url: "https://jobs.lumora-labs.example/apply/senior-ai-engineer-llm-rag-lumora-labs?utm_source=remoteok", url: "https://remoteok.com/remote-jobs/remote-senior-ai-engineer-lumora-labs-999001" });
const flow = S[8];
remoteok.push({ slug: "remote-ai-automation-specialist-flowcraft-999002", id: "999002", epoch: Math.floor(now / 1000) - 3600, company: "Flowcraft Studio", company_logo: "", position: flow.title, tags: flow.tags, description: describe(flow), location: "Worldwide", salary_min: 0, salary_max: 0, apply_url: "https://remoteok.com/remote-jobs/999002/apply", url: "https://remoteok.com/remote-jobs/remote-ai-automation-specialist-flowcraft-999002" });

// Edge cases
jobicy.push({ id: 140001, url: "https://jobicy.com/jobs/140001-missing-bits", jobTitle: "Operations Assistant", companyName: "", jobType: ["full-time"], jobGeo: "", jobLevel: "Any", jobExcerpt: "", jobDescription: "<p>Short.</p>", pubDate: iso(1).replace("T", " ").slice(0, 19), salaryMin: 0, salaryMax: -5, salaryCurrency: "USD" });
jobicy.push({ id: 140002, jobTitle: "No URL job", companyName: "Ghost Co" }); // invalid: no url
remoteok.push({ slug: "remote-crypto-earn", id: "999003", epoch: Math.floor(now / 1000) - 600, company: "QuickEarn Online", position: "Work From Home Typing Job – Earn $500 per day", tags: ["data entry"], description: "<p>Earn $500 per day from home, no experience needed! Pay a registration fee of $20 to start. Salary paid in USDT. Contact us on Telegram only.</p>", location: "Worldwide", salary_min: 0, salary_max: 0, apply_url: "https://t.me/quickearn", url: "https://remoteok.com/remote-jobs/remote-crypto-earn-999003" });

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Remote OK</title>
${S.slice(40, 43).map((s, k) => `<item><title><![CDATA[${s.title}]]></title><company>${s.company}</company><location>${s.loc || "Worldwide"}</location><tags>${s.tags.join(",")}</tags><link>https://remoteok.com/remote-jobs/rss-${880000 + k}</link><guid>https://remoteok.com/remote-jobs/${880000 + k}</guid><pubDate>${new Date(iso(s.daysAgo)).toUTCString()}</pubDate><description><![CDATA[${describe(s)}]]></description></item>`).join("\n")}
</channel></rss>`;

const dir = new URL("../tests/fixtures/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL("himalayas.json", dir), JSON.stringify({ updatedAt: now, offset: 0, limit: 20, totalCount: himalayas.length, jobs: himalayas, nextCursor: null }, null, 1));
writeFileSync(new URL("jobicy.json", dir), JSON.stringify({ apiVersion: "2", jobCount: jobicy.length, jobs: jobicy }, null, 1));
writeFileSync(new URL("remoteok.json", dir), JSON.stringify(remoteok, null, 1));
writeFileSync(new URL("remoteok.rss", dir), rss);
writeFileSync(new URL("jobicy-taxonomy-industries.json", dir), JSON.stringify({ industries: [{ industryID: 1, industrySlug: "engineering", industryName: "Software Engineering" }, { industryID: 2, industrySlug: "data-science", industryName: "Data Science &amp; Analytics" }, { industryID: 3, industrySlug: "copywriting", industryName: "Copywriting" }] }));
writeFileSync(new URL("jobicy-taxonomy-locations.json", dir), JSON.stringify({ locations: [{ geoID: 1, geoSlug: "apac", geoName: "APAC" }, { geoID: 2, geoSlug: "anywhere", geoName: "Anywhere" }, { geoID: 3, geoSlug: "usa", geoName: "USA" }] }));
console.log(`specs=${S.length} himalayas=${himalayas.length} jobicy=${jobicy.length} remoteok=${remoteok.length - 1}`);
