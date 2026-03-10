import { relations } from 'drizzle-orm';
import {
  pgEnum,
  pgTable,
  uuid,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { user } from '../../../auth/entities/auth.schema';
import { scoutSubmission } from './scout.schema';

// ============================================================================
// ENUMS
// ============================================================================

export enum ScoutCommissionStatus {
  PENDING = 'pending',
  PAID = 'paid',
}

export const scoutCommissionStatusEnum = pgEnum('scout_commission_status', [
  ScoutCommissionStatus.PENDING,
  ScoutCommissionStatus.PAID,
]);

// ============================================================================
// SCOUT COMMISSIONS TABLE
// ============================================================================

export const scoutCommission = pgTable(
  'scout_commissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scoutId: uuid('scout_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => scoutSubmission.id, { onDelete: 'cascade' }),
    dealSize: integer('deal_size').notNull(),
    commissionRate: integer('commission_rate').notNull(),
    commissionAmount: integer('commission_amount').notNull(),
    status: scoutCommissionStatusEnum('status')
      .default(ScoutCommissionStatus.PENDING)
      .notNull(),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('scout_commission_scout_idx').on(table.scoutId),
    index('scout_commission_submission_idx').on(table.submissionId),
    index('scout_commission_status_idx').on(table.status),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const scoutCommissionRelations = relations(
  scoutCommission,
  ({ one }) => ({
    scout: one(user, {
      fields: [scoutCommission.scoutId],
      references: [user.id],
    }),
    submission: one(scoutSubmission, {
      fields: [scoutCommission.submissionId],
      references: [scoutSubmission.id],
    }),
  }),
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ScoutCommission = typeof scoutCommission.$inferSelect;
export type NewScoutCommission = typeof scoutCommission.$inferInsert;
