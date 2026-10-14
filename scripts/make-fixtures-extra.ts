// Fixtures for the second wave of sources, shaped like each source's documented response.
// Companies are fictional.   npx tsx scripts/make-fixtures-extra.ts
import { writeFileSync } from "node:fs";

const now = Date.now();
const iso = (h: number) => new Date(now - h * 3600000).toISOString();
const dir = new URL("../tests/fixtures/", import.meta.url);
const w = (n: string, v: unknown) => writeFileSync(new URL(n, dir), JSON.stringify(v, null, 1));

// Remotive: { "job-count", jobs: [...] }
w("remotive.json", {
  "00-warning": "Please link back to Remotive and mention Remotive as a source.",
  "job-count": 7,
  jobs: [
    { id: 2001, url: "https://remotive.com/remote-jobs/ai-ml/llm-engineer-2001", title: "LLM Engineer", company_name: "Brightquill", company_logo: "https://remotive.com/job/2001/logo", category: "AI / ML", tags: ["llm", "python", "rag"], job_type: "full_time", publication_date: iso(5), candidate_required_location: "Worldwide", salary: "$90,000 - $130,000", description: "<p>Build RAG pipelines with LangChain and the OpenAI API. Design AI agents and evaluate prompts.</p>" },
    { id: 2002, url: "https://remotive.com/remote-jobs/software-dev/react-developer-2002", title: "React Developer (Contract)", company_name: "Pixelport", category: "Software Development", tags: ["react", "typescript"], job_type: "contract", publication_date: iso(20), candidate_required_location: "India, Sri Lanka", salary: "$25-$35/hr", description: "<p>6 month contract building React dashboards.</p>" },
    { id: 2003, url: "https://remotive.com/remote-jobs/writing/content-writer-2003", title: "Freelance Content Writer", company_name: "Wordleaf", category: "Writing", tags: ["seo", "content"], job_type: "freelance", publication_date: iso(30), candidate_required_location: "Worldwide", salary: "", description: "<p>Write SEO blog posts. Paid per article, ongoing work.</p>" },
    { id: 2004, url: "https://remotive.com/remote-jobs/customer-support/support-2004", title: "Customer Support Specialist", company_name: "Helply", category: "Customer Service", tags: ["support"], job_type: "full_time", publication_date: iso(40), candidate_required_location: "USA Only", salary: "$45k", description: "<p>Must be located in the United States.</p>" },
    { id: 2005, url: "https://remotive.com/remote-jobs/data/data-analyst-2005", title: "Data Analyst (Power BI)", company_name: "Metricly", category: "Data", tags: ["power bi", "sql"], job_type: "part_time", publication_date: iso(50), candidate_required_location: "APAC", salary: "", description: "<p>Part-time Power BI reporting, 20 hours per week.</p>" },
    { id: 2006, url: "https://remotive.com/remote-jobs/design/video-editor-2006", title: "Video Editor – YouTube", company_name: "Creatorhaus", category: "Design", tags: ["video editing", "youtube"], job_type: "freelance", publication_date: iso(60), candidate_required_location: "Worldwide", salary: "$500 per project", description: "<p>Edit long-form YouTube videos with Premiere Pro.</p>" },
    { title: "Broken item without id" },
  ],
});

// Adzuna: { results: [...] } (India)
w("adzuna-in.json", {
  __CLASS__: "Adzuna::API::Response::JobSearchResults", count: 5,
  results: [
    { id: "4501", title: "Accounts Executive (Tally)", description: "Maintain books of accounts in <strong>Tally</strong>, GST returns and billing…", redirect_url: "https://www.adzuna.in/land/ad/4501?se=x&v=y", created: iso(3), company: { display_name: "Sai Durga Traders" }, location: { display_name: "Vijayawada, Krishna", area: ["India", "Andhra Pradesh", "Krishna", "Vijayawada"] }, salary_min: 240000, salary_max: 300000, salary_is_predicted: "0", contract_time: "full_time", category: { label: "Accounting & Finance Jobs", tag: "accounting-finance-jobs" } },
    { id: "4502", title: "Python Developer", description: "Django, REST APIs and PostgreSQL. 2-4 years of experience…", redirect_url: "https://www.adzuna.in/land/ad/4502", created: iso(8), company: { display_name: "Codekraft" }, location: { display_name: "Hyderabad, Telangana", area: ["India", "Telangana", "Hyderabad"] }, salary_min: 600000, salary_max: 900000, salary_is_predicted: "1", contract_time: "full_time", category: { label: "IT Jobs" } },
    { id: "4503", title: "Data Entry Operator - Work From Home", description: "Remote data entry, Excel knowledge required, part time…", redirect_url: "https://www.adzuna.in/land/ad/4503", created: iso(12), company: { display_name: "Infodesk Services" }, location: { display_name: "India", area: ["India"] }, contract_time: "part_time", category: { label: "Admin Jobs" } },
    { id: "4504", title: "Sales Executive", description: "Field sales in Guntur district…", redirect_url: "https://www.adzuna.in/land/ad/4504", created: iso(20), company: { display_name: "Krishna Agro" }, location: { display_name: "Guntur, Andhra Pradesh", area: ["India", "Andhra Pradesh", "Guntur"] }, salary_min: 180000, salary_max: 240000, salary_is_predicted: "0", contract_type: "permanent", category: { label: "Sales Jobs" } },
    { id: "4505", title: "Machine Learning Engineer", description: "Train ML models with PyTorch, deploy with MLOps tooling, NLP experience…", redirect_url: "https://www.adzuna.in/land/ad/4505", created: iso(30), company: { display_name: "Visionary AI Labs" }, location: { display_name: "Bengaluru, Karnataka", area: ["India", "Karnataka", "Bengaluru"] }, salary_min: 1800000, salary_max: 2800000, salary_is_predicted: "0", contract_time: "full_time", category: { label: "IT Jobs" } },
  ],
});

// Freelancer.com: { status, result: { projects: [...] } }
w("freelancer.json", {
  status: "success",
  result: {
    total_count: 5,
    projects: [
      { id: 39001, title: "Build n8n workflow to sync WhatsApp leads into Google Sheets", seo_url: "n8n/Build-workflow-sync-WhatsApp-leads", description: "Need an n8n expert to automate WhatsApp Business leads into Google Sheets and send ChatGPT-generated replies.", currency: { code: "INR" }, budget: { minimum: 12500, maximum: 37500 }, type: "fixed", time_submitted: Math.floor(now / 1000) - 3600, jobs: [{ name: "n8n" }, { name: "Automation" }, { name: "ChatGPT" }], status: "active", local: false },
      { id: 39002, title: "Python script for PDF invoice extraction", seo_url: "python/Python-script-PDF-invoice", description: "Extract fields from PDF invoices into Excel. One-time project.", currency: { code: "USD" }, budget: { minimum: 30, maximum: 250 }, type: "fixed", time_submitted: Math.floor(now / 1000) - 7200, jobs: [{ name: "Python" }, { name: "Excel" }], status: "active" },
      { id: 39003, title: "Video editor for Telugu YouTube channel", seo_url: "video-editing/Video-editor-Telugu-YouTube", description: "Edit 4 long videos and 12 Shorts every month. Ongoing.", currency: { code: "INR" }, budget: { minimum: 600, maximum: 1500 }, type: "hourly", hourly_project_info: { duration_enum: "over_six_months", commitment: { hours: 10, interval: "week" } }, time_submitted: Math.floor(now / 1000) - 10800, jobs: [{ name: "Video Editing" }, { name: "YouTube" }], status: "active" },
      { id: 39004, title: "Fine-tune an LLM chatbot on our support docs (RAG)", seo_url: "machine-learning/Fine-tune-LLM-chatbot-RAG", description: "Build a RAG chatbot over our help center using LangChain and a vector database; deploy as a web widget.", currency: { code: "USD" }, budget: { minimum: 750, maximum: 1500 }, type: "fixed", hourly_project_info: { duration_enum: "one_to_four_weeks" }, time_submitted: Math.floor(now / 1000) - 14400, jobs: [{ name: "Machine Learning (ML)" }, { name: "Python" }, { name: "AI Chatbot" }], status: "active" },
      { id: 39005, title: "Logo design for organic food brand", seo_url: "logo-design/Logo-organic-food-brand", description: "Need a logo and brand colours.", currency: { code: "INR" }, budget: { minimum: 1500, maximum: 12500 }, type: "fixed", time_submitted: Math.floor(now / 1000) - 18000, jobs: [{ name: "Logo Design" }, { name: "Graphic Design" }], status: "closed" },
    ],
  },
});

// Working Nomads: array
w("workingnomads.json", [
  { url: "https://www.workingnomads.com/job/go/77001/", title: "Senior Backend Engineer (Go)", description: "<p>Distributed systems in Go.</p>", company_name: "Cloudlane", category_name: "Development", tags: "go,kubernetes", location: "Anywhere", pub_date: iso(6) },
  { url: "https://www.workingnomads.com/job/go/77002/", title: "Virtual Assistant", description: "<p>Calendar and inbox management.</p>", company_name: "Assistly", category_name: "Administration", tags: "virtual assistant", location: "Time zone: IST (+/- 2 hours)", pub_date: iso(9) },
  { url: "https://www.workingnomads.com/job/go/77003/", title: "Marketing Manager", description: "<p>B2B SaaS marketing.</p>", company_name: "Growthwise", category_name: "Marketing", tags: "", location: "USA, Canada", pub_date: iso(15) },
]);

// Arbeitnow: { data: [...], links: { next } }
w("arbeitnow.json", {
  data: [
    { slug: "remote-ml-ops-engineer-berlin-123", company_name: "Datafluss GmbH", title: "MLOps Engineer (Remote)", description: "<p>Kubernetes, PyTorch model serving, machine learning platform.</p>", remote: true, url: "https://www.arbeitnow.com/jobs/companies/datafluss/remote-ml-ops-engineer-berlin-123", tags: ["machine learning", "kubernetes"], job_types: ["full time"], location: "Berlin", created_at: Math.floor(now / 1000) - 5000 },
    { slug: "office-manager-munich-124", company_name: "Bureau AG", title: "Office Manager", description: "<p>On-site role.</p>", remote: false, url: "https://www.arbeitnow.com/jobs/companies/bureau/office-manager-munich-124", tags: [], job_types: ["full time"], location: "Munich", created_at: Math.floor(now / 1000) - 9000 },
    { slug: "remote-frontend-dev-125", company_name: "Webwerk", title: "Frontend Developer (React)", description: "<p>React and TypeScript, EU timezones.</p>", remote: true, url: "https://www.arbeitnow.com/jobs/companies/webwerk/remote-frontend-dev-125", tags: ["react", "typescript"], job_types: ["contract"], location: "Germany", created_at: Math.floor(now / 1000) - 12000 },
  ],
  links: { next: null },
});
console.log("extra fixtures written");
