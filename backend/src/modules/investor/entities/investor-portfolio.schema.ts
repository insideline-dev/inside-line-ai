import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { user } from '../../../auth/entities/auth.schema';
import { startup } from '../../startup/entities/startup.schema';

// ============================================================================
// INVESTOR PORTFOLIO TABLE
// ============================================================================

export const investorPortfolio = pgTable(
  'investor_portfolios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    startupId: uuid('startup_id')
      .notNull()
      .references(() => startup.id, { onDelete: 'cascade' }),
    dealSize: integer('deal_size'),
    dealStage: text('deal_stage'),
    investedAt: timestamp('invested_at').notNull(),
    exitedAt: timestamp('exited_at'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('investor_portfolio_investor_idx').on(table.investorId),
    index('investor_portfolio_startup_idx').on(table.startupId),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const investorPortfolioRelations = relations(
  investorPortfolio,
  ({ one }) => ({
    investor: one(user, {
      fields: [investorPortfolio.investorId],
      references: [user.id],
    }),
    startup: one(startup, {
      fields: [investorPortfolio.startupId],
      references: [startup.id],
    }),
  }),
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type InvestorPortfolio = typeof investorPortfolio.$inferSelect;
export type NewInvestorPortfolio = typeof investorPortfolio.$inferInsert;
