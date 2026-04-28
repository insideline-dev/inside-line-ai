/**
 * Job-name discriminator for investor onboarding scrape jobs on QUEUE_NAMES.TASK.
 * Reuses the shared TASK queue (see DS-E3-F1-S2 plan) — no new queue introduced.
 */
export const INVESTOR_ONBOARDING_SCRAPE_JOB = "investor.onboarding.scrape" as const;

export interface InvestorOnboardingScrapeJobPayload {
  userId: string;
  website: string;
}
