import type { SourceAdapter } from "./base.ts";
import { EmployerSubmissionAdapter } from "./employer.ts";
import { HimalayasAdapter } from "./himalayas.ts";
import { JobicyAdapter } from "./jobicy.ts";
import { RemoteOkAdapter } from "./remoteok.ts";
import { StartupJobsAdapter } from "./startupjobs.ts";
import { RemotiveAdapter } from "./remotive.ts";
import { AdzunaAdapter } from "./adzuna.ts";
import { FreelancerAdapter } from "./freelancer.ts";
import { WorkingNomadsAdapter } from "./workingnomads.ts";
import { ArbeitnowAdapter } from "./arbeitnow.ts";
import { AshbyAdapter, GreenhouseAdapter, LeverAdapter } from "./ats.ts";
import { WeWorkRemotelyAdapter } from "./weworkremotely.ts";
import { JoobleAdapter } from "./jooble.ts";

export const ADAPTERS: Record<string, () => SourceAdapter> = {
  himalayas: () => new HimalayasAdapter(),
  jobicy: () => new JobicyAdapter(),
  remoteok: () => new RemoteOkAdapter(),
  startupjobs: () => new StartupJobsAdapter(),
  remotive: () => new RemotiveAdapter(),
  adzuna: () => new AdzunaAdapter(),
  freelancer: () => new FreelancerAdapter(),
  workingnomads: () => new WorkingNomadsAdapter(),
  arbeitnow: () => new ArbeitnowAdapter(),
  greenhouse: () => new GreenhouseAdapter(),
  lever: () => new LeverAdapter(),
  ashby: () => new AshbyAdapter(),
  weworkremotely: () => new WeWorkRemotelyAdapter(),
  jooble: () => new JoobleAdapter(),
  employer: () => new EmployerSubmissionAdapter(),
};

export function getAdapter(slug: string): SourceAdapter {
  const f = ADAPTERS[slug];
  if (!f) throw new Error(`No adapter registered for source "${slug}"`);
  return f();
}

export * from "./base.ts";
export { mapArgs, parseMcpBody, findJobArray, mapStartupJob } from "./startupjobs.ts";
export { mapHimalayasJob } from "./himalayas.ts";
export { mapJobicyJob, extractSlugs } from "./jobicy.ts";
export { mapRemoteOkJob } from "./remoteok.ts";
export { mapRemotiveJob } from "./remotive.ts";
export { mapAdzunaJob } from "./adzuna.ts";
export { mapFreelancerProject } from "./freelancer.ts";
export { mapWorkingNomadsJob } from "./workingnomads.ts";
export { mapArbeitnowJob } from "./arbeitnow.ts";
export { mapWwrItem, splitWwrTitle } from "./weworkremotely.ts";
export { mapJoobleJob, JOOBLE_DEFAULT_QUERIES } from "./jooble.ts";
export { mapAshbyJob, mapGreenhouseJob, mapLeverPosting, parseBoardLines, readBoards, relevantLocation, type AtsBoard } from "./ats.ts";
export { HimalayasAdapter, JobicyAdapter, RemoteOkAdapter, StartupJobsAdapter, EmployerSubmissionAdapter, RemotiveAdapter, AdzunaAdapter, FreelancerAdapter, WorkingNomadsAdapter, ArbeitnowAdapter, GreenhouseAdapter, LeverAdapter, AshbyAdapter, WeWorkRemotelyAdapter, JoobleAdapter };
