// Deterministic category / skill taxonomy. Seeded into public.job_categories
// (see scripts/generate-taxonomy-sql.ts) so the DB and the classifier never drift.

export type CategoryGroup = "ai-ml" | "software-development" | "creative" | "business";

export interface CategoryDef {
  slug: string;
  name: string;
  name_te: string;
  group: CategoryGroup;
  /** group = top-level, field = role family, skill = technology/tool. */
  kind: "group" | "field" | "skill";
  /** Patterns tested against title + tags + description (unless titleOnly). */
  patterns: RegExp[];
  /** Only count matches in the title/tags (for words that are noisy in descriptions). */
  titleOnly?: boolean;
  /** Counts as an AI subcategory (used for ai_category). */
  ai?: boolean;
  /** Priority when picking the single subcategory (higher wins). */
  weight?: number;
}

export const GROUPS: Array<{ slug: CategoryGroup; name: string; name_te: string }> = [
  { slug: "ai-ml", name: "AI & Machine Learning", name_te: "AI & మెషిన్ లెర్నింగ్" },
  { slug: "software-development", name: "Software Development", name_te: "సాఫ్ట్‌వేర్ డెవలప్‌మెంట్" },
  { slug: "creative", name: "Creative", name_te: "క్రియేటివ్" },
  { slug: "business", name: "Business", name_te: "బిజినెస్" },
];

const b = (src: string, flags = "i") => new RegExp(`(?<![A-Za-z0-9])(?:${src})(?![A-Za-z0-9])`, flags);

export const CATEGORIES: CategoryDef[] = [
  // ── AI & Machine Learning ──────────────────────────────────────────────
  { slug: "ai-engineering", name: "AI Engineering", name_te: "AI ఇంజనీరింగ్", group: "ai-ml", kind: "field", ai: true, weight: 6,
    patterns: [b("AI (?:engineer|developer|architect|specialist|scientist)"), b("artificial intelligence (?:engineer|developer)"), b("applied AI")] },
  { slug: "generative-ai", name: "Generative AI", name_te: "జనరేటివ్ AI", group: "ai-ml", kind: "field", ai: true, weight: 8,
    patterns: [b("generative AI"), b("gen ?AI"), b("diffusion models?"), b("foundation models?")] },
  { slug: "llm", name: "LLM", name_te: "LLM", group: "ai-ml", kind: "field", ai: true, weight: 9,
    patterns: [b("LLMs?", ""), b("large language models?"), b("GPT-?[345](?:o|\\.5)?"), b("fine-?tun(?:e|ing) (?:LLMs?|language models?)")] },
  { slug: "prompt-engineering", name: "Prompt Engineering", name_te: "ప్రాంప్ట్ ఇంజనీరింగ్", group: "ai-ml", kind: "field", ai: true, weight: 9,
    patterns: [b("prompt engineer(?:ing)?"), b("prompt design")] },
  { slug: "ai-agents", name: "AI Agents", name_te: "AI ఏజెంట్లు", group: "ai-ml", kind: "field", ai: true, weight: 9,
    patterns: [b("AI agents?"), b("agentic"), b("autonomous agents?"), b("multi-agent"), b("CrewAI"), b("AutoGen"), b("LangGraph")] },
  { slug: "rag", name: "RAG", name_te: "RAG", group: "ai-ml", kind: "field", ai: true, weight: 9,
    patterns: [b("RAG", ""), b("retrieval[- ]augmented"), b("LangChain"), b("LlamaIndex"), b("vector (?:database|db|search|store)s?"), b("Pinecone"), b("Weaviate"), b("pgvector")] },
  { slug: "machine-learning", name: "Machine Learning", name_te: "మెషిన్ లెర్నింగ్", group: "ai-ml", kind: "field", ai: true, weight: 7,
    patterns: [b("machine learning"), b("ML", ""), b("MLOps"), b("scikit-learn"), b("XGBoost")] },
  { slug: "deep-learning", name: "Deep Learning", name_te: "డీప్ లెర్నింగ్", group: "ai-ml", kind: "field", ai: true, weight: 7,
    patterns: [b("deep learning"), b("neural networks?"), b("PyTorch"), b("TensorFlow"), b("Keras"), b("JAX", "")] },
  { slug: "computer-vision", name: "Computer Vision", name_te: "కంప్యూటర్ విజన్", group: "ai-ml", kind: "field", ai: true, weight: 8,
    patterns: [b("computer vision"), b("OpenCV"), b("image recognition"), b("object detection"), b("YOLO(?:v\\d+)?", "")] },
  { slug: "nlp", name: "NLP", name_te: "NLP (భాషా ప్రాసెసింగ్)", group: "ai-ml", kind: "field", ai: true, weight: 8,
    patterns: [b("NLP", ""), b("natural language processing"), b("Hugging ?Face"), b("transformers? models?"), b("BERT", "")] },
  { slug: "data-science", name: "Data Science", name_te: "డేటా సైన్స్", group: "ai-ml", kind: "field", ai: true, weight: 5,
    patterns: [b("data scien(?:ce|tist)s?"), b("predictive model(?:l)?ing"), b("statistical model(?:l)?ing")] },
  { slug: "data-engineering", name: "Data Engineering", name_te: "డేటా ఇంజనీరింగ్", group: "ai-ml", kind: "field", weight: 5,
    patterns: [b("data engineer(?:ing)?"), b("ETL", ""), b("data pipelines?"), b("Airflow"), b("Spark", ""), b("Databricks"), b("Snowflake", "")] },
  { slug: "ai-automation", name: "Automation", name_te: "ఆటోమేషన్", group: "ai-ml", kind: "field", ai: true, weight: 6,
    patterns: [b("AI automation"), b("workflow automation"), b("automation (?:specialist|expert|engineer|developer|consultant)"), b("no-?code automation"), b("RPA", ""), b("business process automation")] },
  { slug: "n8n", name: "n8n", name_te: "n8n", group: "ai-ml", kind: "skill", ai: true, weight: 4, patterns: [b("n8n")] },
  { slug: "zapier", name: "Zapier", name_te: "Zapier", group: "ai-ml", kind: "skill", weight: 3, patterns: [b("Zapier")] },
  { slug: "make", name: "Make", name_te: "Make", group: "ai-ml", kind: "skill", weight: 3,
    patterns: [b("make\\.com"), b("Integromat"), b("Make \\((?:formerly )?Integromat\\)")] },
  { slug: "chatgpt", name: "ChatGPT", name_te: "ChatGPT", group: "ai-ml", kind: "skill", ai: true, weight: 4,
    patterns: [b("ChatGPT"), b("OpenAI"), b("GPT-?4o?"), b("Custom GPTs?")] },
  { slug: "claude", name: "Claude", name_te: "Claude", group: "ai-ml", kind: "skill", ai: true, weight: 4,
    patterns: [b("Claude(?: AI| Code| API)?", ""), b("Anthropic")] },
  { slug: "gemini", name: "Gemini", name_te: "Gemini", group: "ai-ml", kind: "skill", ai: true, weight: 4,
    patterns: [b("Google Gemini"), b("Gemini (?:API|Pro|Flash|models?)"), b("Vertex AI")] },
  { slug: "copilot", name: "Copilot", name_te: "Copilot", group: "ai-ml", kind: "skill", ai: true, weight: 3,
    patterns: [b("GitHub Copilot"), b("Microsoft Copilot"), b("Copilot Studio"), b("Copilot", "")] },

  // ── Software Development ──────────────────────────────────────────────
  { slug: "web-development", name: "Web Development", name_te: "వెబ్ డెవలప్‌మెంట్", group: "software-development", kind: "field", weight: 3,
    patterns: [b("web (?:developer|development|designer|app)"), b("full[- ]?stack"), b("front[- ]?end"), b("WordPress"), b("Shopify (?:developer|expert)"), b("landing page")] },
  { slug: "python", name: "Python", name_te: "పైథాన్", group: "software-development", kind: "skill", weight: 2, patterns: [b("Python"), b("Django"), b("FastAPI"), b("Flask", "")] },
  { slug: "java", name: "Java", name_te: "జావా", group: "software-development", kind: "skill", weight: 2, patterns: [b("Java(?!\\s*Script)"), b("Spring Boot"), b("Kotlin")] },
  { slug: "javascript", name: "JavaScript", name_te: "జావాస్క్రిప్ట్", group: "software-development", kind: "skill", weight: 2, patterns: [b("JavaScript"), b("ES6"), b("JS", "")] },
  { slug: "typescript", name: "TypeScript", name_te: "టైప్‌స్క్రిప్ట్", group: "software-development", kind: "skill", weight: 2, patterns: [b("TypeScript")] },
  { slug: "react", name: "React", name_te: "React", group: "software-development", kind: "skill", weight: 2, patterns: [b("React(?:\\.js|JS)?", ""), b("React Native"), b("Redux")] },
  { slug: "nextjs", name: "Next.js", name_te: "Next.js", group: "software-development", kind: "skill", weight: 2, patterns: [b("Next\\.?js")] },
  { slug: "nodejs", name: "Node.js", name_te: "Node.js", group: "software-development", kind: "skill", weight: 2, patterns: [b("Node\\.?js"), b("NestJS"), b("Express\\.js")] },
  { slug: "dotnet", name: ".NET", name_te: ".NET", group: "software-development", kind: "skill", weight: 2, patterns: [/(?<![A-Za-z0-9])\.NET(?![A-Za-z0-9])/, b("ASP\\.NET"), b("dotnet")] },
  { slug: "csharp", name: "C#", name_te: "C#", group: "software-development", kind: "skill", weight: 2, patterns: [/(?<![A-Za-z0-9])C#(?![A-Za-z0-9#])/i, b("C Sharp")] },
  { slug: "sql", name: "SQL", name_te: "SQL", group: "software-development", kind: "skill", weight: 2,
    patterns: [b("SQL"), b("PostgreSQL|Postgres"), b("MySQL"), b("T-SQL"), b("SQL Server"), b("DBA", ""), b("database administrator")] },
  { slug: "azure", name: "Azure", name_te: "Azure", group: "software-development", kind: "skill", weight: 2, patterns: [b("Azure"), b("Microsoft Fabric")] },
  { slug: "aws", name: "AWS", name_te: "AWS", group: "software-development", kind: "skill", weight: 2, patterns: [b("AWS", ""), b("Amazon Web Services"), b("Lambda", "")] },
  { slug: "gcp", name: "GCP", name_te: "GCP", group: "software-development", kind: "skill", weight: 2, patterns: [b("GCP", ""), b("Google Cloud"), b("BigQuery")] },
  { slug: "devops", name: "DevOps", name_te: "DevOps", group: "software-development", kind: "field", weight: 3, patterns: [b("DevOps"), b("SRE", ""), b("site reliability"), b("CI/CD"), b("platform engineer")] },
  { slug: "kubernetes", name: "Kubernetes", name_te: "Kubernetes", group: "software-development", kind: "skill", weight: 2, patterns: [b("Kubernetes"), b("K8s"), b("Helm", "")] },
  { slug: "terraform", name: "Terraform", name_te: "Terraform", group: "software-development", kind: "skill", weight: 2, patterns: [b("Terraform"), b("OpenTofu")] },

  // ── Creative ──────────────────────────────────────────────────────────
  { slug: "video-editing", name: "Video Editing", name_te: "వీడియో ఎడిటింగ్", group: "creative", kind: "field", weight: 5,
    patterns: [b("video edit(?:or|ing)"), b("Premiere Pro"), b("DaVinci Resolve"), b("Final Cut"), b("After Effects"), b("CapCut")] },
  { slug: "youtube", name: "YouTube", name_te: "యూట్యూబ్", group: "creative", kind: "skill", weight: 3, patterns: [b("YouTube")] },
  { slug: "shorts", name: "Shorts", name_te: "Shorts", group: "creative", kind: "skill", weight: 3, patterns: [b("YouTube Shorts"), b("short-form video"), b("Shorts", "")] },
  { slug: "reels", name: "Reels", name_te: "Reels", group: "creative", kind: "skill", weight: 3, patterns: [b("Instagram Reels"), b("Reels"), b("TikTok videos?")] },
  { slug: "graphic-design", name: "Graphic Design", name_te: "గ్రాఫిక్ డిజైన్", group: "creative", kind: "field", weight: 4,
    patterns: [b("graphic design(?:er)?"), b("Photoshop"), b("Illustrator", ""), b("logo design"), b("brand(?:ing)? designer"), b("Figma")] },
  { slug: "canva", name: "Canva", name_te: "Canva", group: "creative", kind: "skill", weight: 3, patterns: [b("Canva")] },
  { slug: "ai-image-generation", name: "AI Image Generation", name_te: "AI ఇమేజ్ జనరేషన్", group: "creative", kind: "field", ai: true, weight: 6,
    patterns: [b("Midjourney"), b("Stable Diffusion"), b("DALL[- ·]?E"), b("AI (?:art|image|images|illustrations?)"), b("text[- ]to[- ]image")] },
  { slug: "ai-video", name: "AI Video", name_te: "AI వీడియో", group: "creative", kind: "field", ai: true, weight: 6,
    patterns: [b("AI video"), b("Runway(?:ML)?", ""), b("Sora", ""), b("HeyGen"), b("Synthesia"), b("Pika Labs"), b("text[- ]to[- ]video")] },

  // ── Business ──────────────────────────────────────────────────────────
  { slug: "virtual-assistant", name: "Virtual Assistant", name_te: "వర్చువల్ అసిస్టెంట్", group: "business", kind: "field", weight: 5,
    patterns: [b("virtual assistant"), b("executive assistant"), b("admin(?:istrative)? assistant")] },
  { slug: "data-entry", name: "Data Entry", name_te: "డేటా ఎంట్రీ", group: "business", kind: "field", weight: 5, patterns: [b("data entry"), b("typing (?:job|work)"), b("data input")] },
  { slug: "excel", name: "Excel", name_te: "ఎక్సెల్", group: "business", kind: "skill", weight: 2, patterns: [b("Excel", ""), b("MS Excel|Microsoft Excel"), b("Google Sheets"), b("VBA", "")] },
  { slug: "power-bi", name: "Power BI", name_te: "Power BI", group: "business", kind: "skill", weight: 3, patterns: [b("Power ?BI"), b("DAX", ""), b("Tableau"), b("Looker")] },
  { slug: "research", name: "Research", name_te: "రీసెర్చ్", group: "business", kind: "field", weight: 2, titleOnly: true,
    patterns: [b("research(?:er)?"), b("market research"), b("lead research")] },
  { slug: "seo", name: "SEO", name_te: "SEO", group: "business", kind: "field", weight: 4, patterns: [b("SEO", ""), b("search engine optimi[sz]ation")] },
  { slug: "content-writing", name: "Content Writing", name_te: "కంటెంట్ రైటింగ్", group: "business", kind: "field", weight: 4,
    patterns: [b("content (?:writ(?:er|ing)|creator|marketing)"), b("copywrit(?:er|ing)"), b("blog (?:writer|posts?)"), b("technical writ(?:er|ing)"), b("ghostwrit(?:er|ing)")] },
  { slug: "translation", name: "Translation", name_te: "అనువాదం", group: "business", kind: "field", weight: 4,
    patterns: [b("translat(?:or|ion)"), b("locali[sz]ation"), b("interpreter"), b("transcription")] },
  { slug: "customer-support", name: "Customer Support", name_te: "కస్టమర్ సపోర్ట్", group: "business", kind: "field", weight: 3,
    patterns: [b("customer (?:support|service|success)"), b("support (?:agent|specialist|representative)"), b("help ?desk"), b("chat support")] },
];

export const CATEGORY_BY_SLUG: Record<string, CategoryDef> = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c]));
export const GROUP_BY_SLUG = Object.fromEntries(GROUPS.map((g) => [g.slug, g]));

/** Subcategories shown on the AI jobs page, in order. */
export const AI_PAGE_SUBCATEGORIES = [
  "generative-ai", "ai-engineering", "machine-learning", "llm", "prompt-engineering",
  "ai-automation", "ai-agents", "rag", "data-science", "computer-vision",
];

/** Categories shown on the Freelance page, in order. */
export const FREELANCE_PAGE_CATEGORIES = [
  "ai-automation", "chatgpt", "claude", "gemini", "n8n", "python", "sql", "web-development",
  "seo", "content-writing", "video-editing", "graphic-design", "data-entry",
];
