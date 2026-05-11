import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  jsonb,
  uniqueIndex,
  numeric,
  date,
} from "drizzle-orm/pg-core";
import { startup } from "./startup.schema";

// ============================================================================
// STARTUP FUNDING HISTORY TABLE
// ============================================================================

/**
 * Per-round funding history populated from canonical sources (Crunchbase,
 * SEC EDGAR public filings, press releases).
 *
 * One row per (startupId, roundType, announcedAt). When the same round is
 * detected across multiple providers, the row is merged: `sources` holds
 * every distinct provider that reported the round, including any conflicting
 * values for amount/date so a reviewer can see provider disagreement.
 *
 * This replaces the legacy flat fields on `startup`
 * (`previousFundingAmount`, `previousFundingCurrency`, `previousInvestors`,
 * `previousRoundType`) which are kept backward-compatible for older readers
 * but should no longer be relied upon for new code paths.
 */
export interface FundingHistorySourceEntry {
  provider: "crunchbase" | "public_filing" | "press_release";
  sourceUrl: string;
  fetchedAt: string;
  /**
   * Per-source raw values for the fields most prone to disagreement.
   * Recorded so the UI can surface provider conflicts without re-fetching.
   */
  reportedAmount?: number | null;
  reportedCurrency?: string | null;
  reportedAnnouncedAt?: string | null;
  reportedLeadInvestor?: string | null;
  /**
   * If this source disagreed with the canonical merged row, the keys it
   * disagreed on (e.g. ["amount", "announcedAt"]).
   */
  conflictsWith?: string[];
}

export const startupFundingHistory = pgTable(
  "startup_funding_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startupId: uuid("startup_id")
      .notNull()
      .references(() => startup.id, { onDelete: "cascade" }),

    // Canonical round identity
    roundType: text("round_type").notNull(),
    announcedAt: date("announced_at"),

    // Round details
    amount: numeric("amount", { precision: 20, scale: 2 }),
    currency: text("currency"),
    valuationPostMoney: numeric("valuation_post_money", {
      precision: 20,
      scale: 2,
    }),
    leadInvestor: text("lead_investor"),
    investors: text("investors").array(),

    // Provenance + reconciliation confidence
    sources: jsonb("sources")
      .$type<FundingHistorySourceEntry[]>()
      .notNull()
      .default([]),
    evidenceConfidence: numeric("evidence_confidence", {
      precision: 4,
      scale: 3,
    }),

    lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("startup_funding_history_startup_idx").on(table.startupId),
    index("startup_funding_history_round_idx").on(
      table.startupId,
      table.roundType,
    ),
    uniqueIndex("startup_funding_history_unique_round_idx").on(
      table.startupId,
      table.roundType,
      table.announcedAt,
    ),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const startupFundingHistoryRelations = relations(
  startupFundingHistory,
  ({ one }) => ({
    startup: one(startup, {
      fields: [startupFundingHistory.startupId],
      references: [startup.id],
    }),
  }),
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type StartupFundingHistory = typeof startupFundingHistory.$inferSelect;
export type NewStartupFundingHistory =
  typeof startupFundingHistory.$inferInsert;
