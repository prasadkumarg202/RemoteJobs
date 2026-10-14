// Template for an AUTHORIZED freelance marketplace integration.
//
// Upwork and similar marketplaces are NOT scraped. Only add a source here once
// you hold written/API-terms permission that covers displaying its listings on
// Mana Kosamu (e.g. an official partner API with an access token).
//
// To add one:
//   1. Copy this class, set slug/name, implement fetchJobs() against the
//      official API using ctx.http (rate limits, auth from ctx.secrets).
//   2. Map each project to RawJob — set employmentTypeRaw "freelance"/"gig",
//      salaryPeriodRaw "hourly" or "project" so budgets are derived correctly.
//   3. Register it in adapters/index.ts and insert a public.job_sources row
//      (source_type 'api', enabled = false until terms are reviewed).
//   4. Create supabase/functions/sync-<slug>/index.ts (3 lines, see others).
// No database migration is required.

import type { FetchContext, FetchResult, SourceAdapter } from "./base.ts";

export class FutureFreelanceAdapter implements SourceAdapter {
  constructor(readonly slug = "future-freelance", readonly name = "Authorized freelance source") {}

  fetchJobs(_ctx: FetchContext): Promise<FetchResult> {
    return Promise.reject(new Error(`${this.name} is a template; implement it only with an authorized API.`));
  }
}
