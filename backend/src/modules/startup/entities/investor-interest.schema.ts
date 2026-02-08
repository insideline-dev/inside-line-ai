import { relations } from 'drizzle-orm';
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { user } from '../../../auth/entities/auth.schema';
import { startup } from './startup.schema';

// ============================================================================
// ENUMS
// ============================================================================

export enum InvestorInterestStatus {
  INTERESTED = 'interested',
  PASSED = 'passed',
  MEETING_SCHEDULED = 'meeting_scheduled',
}

export const investorInterestStatusEnum = pgEnum('investor_interest_status', [
  InvestorInterestStatus.INTERESTED,
  InvestorInterestStatus.PASSED,
  InvestorInterestStatus.MEETING_SCHEDULED,
]);

// ============================================================================
// INVESTOR INTEREST TABLE
// ============================================================================

export const investorInterest = pgTable(
  'investor_interests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    startupId: uuid('startup_id')
      .notNull()
      .references(() => startup.id, { onDelete: 'cascade' }),
    status: investorInterestStatusEnum('status')
      .default(InvestorInterestStatus.INTERESTED)
      .notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('investor_interest_investor_idx').on(table.investorId),
    index('investor_interest_startup_idx').on(table.startupId),
    index('investor_interest_status_idx').on(table.status),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const investorInterestRelations = relations(
  investorInterest,
  ({ one }) => ({
    investor: one(user, {
      fields: [investorInterest.investorId],
      references: [user.id],
    }),
    startup: one(startup, {
      fields: [investorInterest.startupId],
      references: [startup.id],
    }),
  }),
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type InvestorInterest = typeof investorInterest.$inferSelect;
export type NewInvestorInterest = typeof investorInterest.$inferInsert;
