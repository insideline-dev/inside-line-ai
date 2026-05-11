// DS-E11-F3-S1 — append-only event log for investor-scoped events.
//
// Parallel to `deal_events` (DS-E8-F1-S1) but investor-scoped rather
// than deal-scoped: `deal_events.startupId` is a non-nullable FK
// (load-bearing invariant — every deal event ties to a deal). Calibration
// proposals are investor-scoped, not deal-scoped, so we mirror the
// pattern in a sibling table instead of widening the deal-event one.
//
// Open future use: thesis updates, weight overrides, dealbreaker rule
// changes — anything an investor does that warrants an audit row but is
// not bound to a single startup belongs here.
//
// Append-only: rows are never mutated or deleted (cascade only when the
// underlying user is removed). Schema is intentionally generic — `type`
// is a string discriminator, `payload` is jsonb.

import {
  pgTable,
  text,
  uuid,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "../../../auth/entities/auth.schema";

/**
 * Discriminator strings — keep stable. Adding a new value is fine; renaming
 * one breaks historical replay. Convention: `<entity>.<verb>` past tense.
 */
export const INVESTOR_EVENT_TYPES = [
  "calibration_proposal_created",
  "calibration_proposal_approved",
  "calibration_proposal_rejected",
] as const;

export type InvestorEventType = (typeof INVESTOR_EVENT_TYPES)[number];

export const investorEvent = pgTable(
  "investor_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    investorUserId: uuid("investor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull().$type<InvestorEventType>(),
    /**
     * Free-form structured payload. Per event type:
     *  - calibration_proposal_created: {
     *      proposalId: string,
     *      idempotencyKey: string,
     *      suggestedDelta: SuggestedCalibrationDelta,
     *      evidence: { topOverrideReasons, lensDeltaSummary },
     *      snapshotHash: string,
     *      status: 'pending',
     *    }
     *  - calibration_proposal_approved: { proposalId: string }
     *  - calibration_proposal_rejected: { proposalId: string, reason?: string }
     */
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Primary read pattern: per-investor timeline, newest first.
    index("investor_event_user_created_idx").on(
      table.investorUserId,
      table.createdAt.desc(),
    ),
    // Cross-investor feed by type — used by recompute job to look up the
    // most recent `calibration_proposal_created` event for idempotency.
    index("investor_event_type_created_idx").on(
      table.type,
      table.createdAt.desc(),
    ),
  ],
);

export const investorEventRelations = relations(investorEvent, ({ one }) => ({
  investor: one(user, {
    fields: [investorEvent.investorUserId],
    references: [user.id],
  }),
}));

export type InvestorEventRow = typeof investorEvent.$inferSelect;
export type NewInvestorEvent = typeof investorEvent.$inferInsert;
