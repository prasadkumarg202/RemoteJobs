# AI: smart search and "Ask AI" (RAG)

Two features built on the live jobs in your database. Both are **off until you add keys**; without them search works exactly as before.

| Feature | What it does | Needs |
|---|---|---|
| **Smart search** | Search matches by meaning, not only exact words ("typing work from home" finds data-entry jobs). Every search page. | `VOYAGE_API_KEY` (or `OPENAI_API_KEY`) |
| **Ask AI** (`/jobs/ask`, "Ask AI" in the menu and under each search box) | A question in English or Telugu → the app finds the best-matching live jobs → Claude answers **only from those jobs**, numbering them [1], [2]… which link to each job. | embeddings key above + `ANTHROPIC_API_KEY` |

## How it works
1. **Embeddings** — every 30 minutes the `embed-jobs` function sends new or changed jobs (title, company, type, location, India eligibility, skills, description) to the embeddings service and stores a 1024-number vector in `jobs.embedding` (pgvector). Expired jobs are skipped.
2. **Search** — the website turns the visitor's words into a vector (cached) and `search_jobs(..., p_embedding)` mixes keyword and meaning ranking. All filters (India eligibility, district, type…) still apply. "Strictness" (admin) sets how close a meaning-only match must be.
3. **Ask AI** — words like *remote, India, fresher, part-time, Guntur* become filters; the 8 closest jobs go to Claude as numbered, untrusted data with strict rules (no invented jobs, honest India eligibility, short answer, Telugu when asked in Telugu). If the AI is off or fails, the matching jobs are still shown.
4. **Limits** — each user gets N questions per day (default 20, Indian time; admins unlimited), counted before Claude is called. Only subscribers can open `/jobs/ask` (same rules as job pages).

## Set up
1. Get an embeddings key: **Voyage AI** (default model `voyage-4-lite`) or **OpenAI** (`text-embedding-3-small`, set `EMBEDDINGS_PROVIDER=openai`). Optional: `EMBEDDINGS_MODEL` (must give 1024 dimensions).
2. `.env.local`: `VOYAGE_API_KEY=…` and `ANTHROPIC_API_KEY=…` (optional `AI_ASSISTANT_MODEL`, default `AI_SUMMARY_MODEL` / `claude-haiku-5-5`).
3. Run the deploy (`aapstack-deploy.bat`): it enables the `vector` extension, adds the database changes, copies the embeddings key to the functions and schedules `jobs-embed` (every 30 min). The first run embeds the existing jobs within an hour or two.
4. `/admin/subscribers → AI`: switch answers on/off, questions per day, strictness.

Switching provider or model later: set the new key/model, then clear old vectors so they are rebuilt: `update jobs set embedding = null, embedding_hash = null;` (in the SQL editor).

Turn off without removing keys: `SMART_SEARCH=off` (search) / `AI_ASSISTANT=off` (answers) in the website env.

## Cost (rough — check current prices)
Embeddings: each job is embedded once (~500 words); a few hundred new jobs a day is a tiny cost. Search queries are cached. Ask AI: one Claude call per question (~3–4K input tokens with 8 jobs + a short answer); the daily limit caps it.
