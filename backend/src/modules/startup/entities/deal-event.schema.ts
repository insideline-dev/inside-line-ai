// DS-E8-F1-S1 — append-only event log for deal-level changes. The
// goal isn't full event-sourcing (we don't rebuild state from these);
// it's a faithful audit trail so a partner can replay history of any
// deal and DS-E8-F1-S2's timeline UI has a single source.
//
// Append-only: rows are never mutated or deleted (cascade only when
// the underlying startup is removed). Schema is intentionally generic
// — `type` is a string discriminator, `payload` is jsonb. That keeps
// the table stable while new event kinds get added in code.
//
// Pragmatic v1 scope: instrument the obvious user-facing milestones
// (status changes, screening, triage, investor decisions). Internal
// mutations (price recompute, queue jobs, etc.) stay out so the
// timeline isn't drowned in noise. New PRs can sprinkle record() calls
// where they matter.

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
import { startup } from "./startup.schema";

/**
 * Discriminator strings — keep stable. Adding a new value is fine; renaming
 * one breaks historical replay. Convention: `<entity>.<verb>` past tense.
 */
export const DEAL_EVENT_TYPES = [
  "startup.submitted",
  "startup.approved",
  "startup.rejected",
  "screening.completed",
  "screening.failed",
  "triage.decided",
  "decision.recorded",
  "comment.added",
  "thesis.regenerated",
  "open_questions.seeded",
  "agent.refresh",
] as const;

export type DealEventType = (typeof DEAL_EVENT_TYPES)[number];

export const dealEvent = pgTable(
  "deal_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startupId: uuid("startup_id")
      .notNull()
      .references(() => startup.id, { onDelete: "cascade" }),
    /**
     * Who performed the action. Nullable because some events are system-
     * driven (pipeline phase completing on its own).
     */
    actorUserId: uuid("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull().$type<DealEventType>(),
    /**
     * Free-form structured payload. Per event type:
     *  - startup.approved/rejected: { reason?: string }
     *  - screening.completed: { lensCount: number, failedKeys: string[] }
     *  - triage.decided: { classification, overallScore, reasonCodes }
     *  - decision.recorded: { verdict, reasonTags, hasNotes, calibration }
     *  - comment.added: { snippet: string }
     *  - thesis.regenerated: { source: 'auto' | 'manual' }
     */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Primary read pattern: timeline for one startup, newest first.
    index("deal_events_startup_occurred_idx").on(
      table.startupId,
      table.occurredAt,
    ),
    // Cross-deal feed for "what happened today across all my deals".
    index("deal_events_type_occurred_idx").on(table.type, table.occurredAt),
  ],
);

export const dealEventRelations = relations(dealEvent, ({ one }) => ({
  startup: one(startup, {
    fields: [dealEvent.startupId],
    references: [startup.id],
  }),
  actor: one(user, {
    fields: [dealEvent.actorUserId],
    references: [user.id],
  }),
}));

export type DealEventRow = typeof dealEvent.$inferSelect;
export type NewDealEvent = typeof dealEvent.$inferInsert;
