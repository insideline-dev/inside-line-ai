import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import {
  startup,
  type Startup,
} from "../../startup/entities/startup.schema";
import {
  startupFundingHistory,
  type FundingHistorySourceEntry,
  type NewStartupFundingHistory,
  type StartupFundingHistory,
} from "../../startup/entities/startup-funding-history.schema";
import type {
  FundingHistoryProvider,
  RawFundingRound,
} from "./interfaces/funding-history-provider.interface";

export const FUNDING_HISTORY_PROVIDERS = Symbol(
  "FUNDING_HISTORY_PROVIDERS",
);

export interface FundingEnrichmentResult {
  startupId: string;
  /** Distinct provider names that returned at least one row */
  providersWithMatches: string[];
  /** Distinct provider names that were configured + attempted */
  providersAttempted: string[];
  /** Final persisted rows (one per unique round) */
  rows: StartupFundingHistory[];
}

interface MergedRound {
  roundType: string;
  announcedAt: string | null;
  /** Per-source raw values keyed by provider name */
  bySource: FundingHistorySourceEntry[];
  /** Canonical (latest-source) values */
  amount: number | null;
  currency: string | null;
  valuationPostMoney: number | null;
  leadInvestor: string | null;
  investors: string[];
  /** Average of provider confidences (0-1) */
  evidenceConfidence: number;
}

@Injectable()
export class FundingEnrichmentService {
  private readonly logger = new Logger(FundingEnrichmentService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    @Inject(FUNDING_HISTORY_PROVIDERS)
    private readonly providers: FundingHistoryProvider[],
  ) {}

  /**
   * Configured providers — useful for status endpoints and tests.
   */
  isConfigured(): boolean {
    return this.providers.some((p) => p.isConfigured());
  }

  /**
   * Run all configured providers for a startup, reconcile their results,
   * and upsert them into `startup_funding_history`. Returns the persisted
   * rows. Always idempotent: re-running the same enrichment updates the
   * same rows in place (via the `(startupId, roundType, announcedAt)`
   * unique index).
   */
  async enrichStartup(startupId: string): Promise<FundingEnrichmentResult> {
    const startupRow = await this.loadStartup(startupId);

    const configuredProviders = this.providers.filter((p) => p.isConfigured());
    if (configuredProviders.length === 0) {
      throw new ServiceUnavailableException(
        "Funding enrichment is unavailable — no providers are configured",
      );
    }

    const hints = {
      name: startupRow.name,
      website: startupRow.website,
      country: startupRow.geoCountryCode ?? null,
    };

    const providersAttempted: string[] = [];
    const providersWithMatches = new Set<string>();
    const rawRounds: RawFundingRound[] = [];

    for (const provider of configuredProviders) {
      providersAttempted.push(provider.providerName);
      try {
        const rounds = await provider.fetchRounds(hints);
        if (rounds.length > 0) {
          providersWithMatches.add(provider.providerName);
          rawRounds.push(...rounds);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Funding provider ${provider.providerName} failed for startup ${startupId}: ${message}`,
        );
      }
    }

    const merged = this.reconcileRounds(rawRounds);
    const rows = await this.persistRounds(startupId, merged);

    this.logger.log(
      `Enriched startup ${startupId}: ${rows.length} rounds from providers [${[...providersWithMatches].join(", ") || "none"}]`,
    );

    return {
      startupId,
      providersAttempted,
      providersWithMatches: [...providersWithMatches],
      rows,
    };
  }

  /**
   * List persisted funding-history rows for a startup, newest round first.
   * Public read path for both the deal card and DD view.
   */
  async listForStartup(
    startupId: string,
  ): Promise<StartupFundingHistory[]> {
    const rows = await this.drizzle.db
      .select()
      .from(startupFundingHistory)
      .where(eq(startupFundingHistory.startupId, startupId));

    // Sort newest first; rows without an announced_at sort last.
    return [...rows].sort((a, b) => {
      const aTime = a.announcedAt ? new Date(a.announcedAt).getTime() : 0;
      const bTime = b.announcedAt ? new Date(b.announcedAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  private async loadStartup(startupId: string): Promise<Startup> {
    const [row] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);
    if (!row) {
      throw new NotFoundException(
        `Startup with ID ${startupId} not found`,
      );
    }
    return row;
  }

  /**
   * Merge rounds across providers. Rounds are considered the same when
   * they share normalized roundType AND announcedAt month (or both are
   * null). On conflict for amount/announcedAt the **most recent source's
   * value wins** (latest `fetchedAt`) but all conflicting values are
   * preserved in each `sources[].conflictsWith` array so the UI can
   * surface disagreement.
   *
   * Exposed (but not exported) for unit tests through the service surface
   * via `enrichStartup` and the public spec helpers.
   */
  reconcileRounds(rawRounds: RawFundingRound[]): MergedRound[] {
    const buckets = new Map<string, RawFundingRound[]>();
    for (const r of rawRounds) {
      const key = this.roundKey(r.roundType, r.announcedAt);
      const bucket = buckets.get(key) ?? [];
      bucket.push(r);
      buckets.set(key, bucket);
    }

    const merged: MergedRound[] = [];
    for (const bucket of buckets.values()) {
      // Sort by fetchedAt desc so element 0 is the most recent.
      const sorted = [...bucket].sort(
        (a, b) =>
          new Date(b.source.fetchedAt).getTime() -
          new Date(a.source.fetchedAt).getTime(),
      );
      const winner = sorted[0];

      const conflictsByIndex: string[][] = sorted.map(() => []);
      const compareKeys: Array<keyof RawFundingRound> = [
        "amount",
        "announcedAt",
        "leadInvestor",
        "valuationPostMoney",
        "currency",
      ];
      for (const key of compareKeys) {
        for (let i = 1; i < sorted.length; i += 1) {
          const a = winner[key];
          const b = sorted[i][key];
          if (a !== b && !(a == null && b == null)) {
            conflictsByIndex[i].push(String(key));
          }
        }
      }

      const sources: FundingHistorySourceEntry[] = sorted.map((r, i) => {
        const base = r.source;
        const entry: FundingHistorySourceEntry = {
          provider: base.provider,
          sourceUrl: base.sourceUrl,
          fetchedAt: base.fetchedAt,
          reportedAmount: r.amount,
          reportedCurrency: r.currency,
          reportedAnnouncedAt: r.announcedAt,
          reportedLeadInvestor: r.leadInvestor,
        };
        if (conflictsByIndex[i].length > 0) {
          entry.conflictsWith = conflictsByIndex[i];
        }
        return entry;
      });

      const investorSet = new Set<string>();
      for (const r of sorted) {
        for (const inv of r.investors) {
          investorSet.add(inv);
        }
      }

      const confidenceSum = sorted.reduce(
        (acc, r) => acc + Math.max(0, Math.min(1, r.confidence)),
        0,
      );

      merged.push({
        roundType: winner.roundType,
        announcedAt: winner.announcedAt,
        bySource: sources,
        amount: winner.amount,
        currency: winner.currency,
        valuationPostMoney: winner.valuationPostMoney,
        leadInvestor: winner.leadInvestor,
        investors: [...investorSet],
        evidenceConfidence: sorted.length > 0 ? confidenceSum / sorted.length : 0,
      });
    }

    return merged;
  }

  private roundKey(
    roundType: string,
    announcedAt: string | null,
  ): string {
    const normalizedType = roundType.trim().toLowerCase().replace(/\s+/g, "_");
    // Bucket by year-month so providers that report different exact days
    // still merge. Falls back to "unknown_date" if absent.
    const dateKey = announcedAt ? announcedAt.slice(0, 7) : "unknown_date";
    return `${normalizedType}::${dateKey}`;
  }

  private async persistRounds(
    startupId: string,
    rounds: MergedRound[],
  ): Promise<StartupFundingHistory[]> {
    if (rounds.length === 0) {
      return [];
    }

    const now = new Date();
    const persisted: StartupFundingHistory[] = [];

    for (const round of rounds) {
      const insert: NewStartupFundingHistory = {
        startupId,
        roundType: round.roundType,
        announcedAt: round.announcedAt,
        amount: round.amount != null ? String(round.amount) : null,
        currency: round.currency,
        valuationPostMoney:
          round.valuationPostMoney != null
            ? String(round.valuationPostMoney)
            : null,
        leadInvestor: round.leadInvestor,
        investors: round.investors.length > 0 ? round.investors : null,
        sources: round.bySource,
        evidenceConfidence: String(round.evidenceConfidence.toFixed(3)),
        lastReconciledAt: now,
      };

      const [row] = await this.drizzle.db
        .insert(startupFundingHistory)
        .values(insert)
        .onConflictDoUpdate({
          target: [
            startupFundingHistory.startupId,
            startupFundingHistory.roundType,
            startupFundingHistory.announcedAt,
          ],
          set: {
            amount: insert.amount,
            currency: insert.currency,
            valuationPostMoney: insert.valuationPostMoney,
            leadInvestor: insert.leadInvestor,
            investors: insert.investors,
            sources: insert.sources,
            evidenceConfidence: insert.evidenceConfidence,
            lastReconciledAt: now,
          },
        })
        .returning();

      if (row) {
        persisted.push(row);
      }
    }

    return persisted;
  }
}
