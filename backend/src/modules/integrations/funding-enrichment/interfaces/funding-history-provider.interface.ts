/**
 * Provider interface for canonical funding-history sources (Crunchbase,
 * SEC EDGAR public filings, press-release scrapers, etc).
 *
 * Each provider must:
 * - Report whether it is configured (env keys present).
 * - Identify itself with a stable `providerName` matching the
 *   `FundingHistorySourceEntry.provider` enum.
 * - Return zero-or-more `RawFundingRound` results for a startup, given
 *   light identity hints. Providers MUST set `sourceUrl` on every row so
 *   we can record provenance.
 *
 * Providers MUST NOT write to the database — persistence is the
 * responsibility of `FundingEnrichmentService`.
 */

import type { FundingHistorySourceEntry } from "../../../startup/entities/startup-funding-history.schema";

export type FundingProviderName = FundingHistorySourceEntry["provider"];

export interface FundingProviderHints {
  /** Canonical startup name */
  name: string;
  /** Optional canonical homepage to disambiguate */
  website?: string | null;
  /** Optional ISO country code, used by US-only sources like EDGAR */
  country?: string | null;
}

export interface RawFundingRound {
  /** Round taxonomy normalized to lowercase snake-case (e.g. "series_a") */
  roundType: string;
  /** ISO date string YYYY-MM-DD if known */
  announcedAt: string | null;
  /** Round size in the reported currency */
  amount: number | null;
  /** ISO 4217 currency code, uppercase */
  currency: string | null;
  /** Post-money valuation if reported */
  valuationPostMoney: number | null;
  /** Named lead investor if reported */
  leadInvestor: string | null;
  /** All co-investors (excluding lead) if reported */
  investors: string[];
  /** Provenance — provider, source URL, and fetch timestamp */
  source: FundingHistorySourceEntry;
  /**
   * Provider's own confidence in this row, 0-1. The
   * reconciliation layer averages this across providers per merged round.
   */
  confidence: number;
}

export interface FundingHistoryProvider {
  /** Stable provider identity */
  readonly providerName: FundingProviderName;

  /** Returns true when env keys are present and the provider can be called. */
  isConfigured(): boolean;

  /**
   * Fetch all known funding rounds for the startup. Returns `[]` on no
   * match — providers MUST NOT throw on empty results.
   *
   * Providers MAY throw on transport failures; the orchestrator catches
   * provider exceptions per-provider so one failing provider does not
   * prevent the others from contributing.
   */
  fetchRounds(hints: FundingProviderHints): Promise<RawFundingRound[]>;
}
