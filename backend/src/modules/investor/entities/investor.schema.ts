import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  index,
  uuid,
  check,
} from 'drizzle-orm/pg-core';
import { user } from '../../../auth/entities/auth.schema';
import { startup } from '../../startup/entities/startup.schema';
import { crudOwnPolicy, appRole, isOwnerOrAdmin } from '../../../common/rls';

// ============================================================================
// INVESTOR THESIS TABLE
// ============================================================================

/**
 * Investment criteria and preferences for an investor
 *
 * One thesis per investor (upsert pattern via unique constraint on userId)
 * Defines what types of startups an investor is looking for
 */
export const investorThesis = pgTable(
  'investor_thesis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Investment criteria
    industries: text('industries').array(),
    stages: text('stages').array(),
    checkSizeMin: integer('check_size_min'),
    checkSizeMax: integer('check_size_max'),
    geographicFocus: text('geographic_focus').array(),

    // Preferences
    mustHaveFeatures: text('must_have_features').array(),
    dealBreakers: text('deal_breakers').array(),
    notes: text('notes'),

    // Active status
    isActive: boolean('is_active').default(true).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('investor_thesis_user_idx').on(table.userId),

    // RLS: Only owner can access their thesis
    ...crudOwnPolicy(table.userId),
  ],
).enableRLS();

// ============================================================================
// SCORING WEIGHTS TABLE
// ============================================================================

/**
 * Custom scoring weights for an investor
 *
 * All weights should sum to 100
 * Defaults: all weights = 20 (equal distribution)
 */
export const scoringWeight = pgTable(
  'scoring_weight',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Score weights (should sum to 100)
    marketWeight: integer('market_weight').default(20).notNull(),
    teamWeight: integer('team_weight').default(20).notNull(),
    productWeight: integer('product_weight').default(20).notNull(),
    tractionWeight: integer('traction_weight').default(20).notNull(),
    financialsWeight: integer('financials_weight').default(20).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('scoring_weight_user_idx').on(table.userId),

    // Constraint: weights must sum to 100
    check(
      'weights_sum_100',
      sql`${table.marketWeight} + ${table.teamWeight} + ${table.productWeight} + ${table.tractionWeight} + ${table.financialsWeight} = 100`,
    ),

    // RLS: Only owner can access their weights
    ...crudOwnPolicy(table.userId),
  ],
).enableRLS();

// ============================================================================
// STARTUP MATCHES TABLE
// ============================================================================

/**
 * Investor-startup matching results
 *
 * Stores computed scores and match metadata
 * One match per investor-startup pair
 */
export const startupMatch = pgTable(
  'startup_match',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    startupId: uuid('startup_id')
      .notNull()
      .references(() => startup.id, { onDelete: 'cascade' }),

    // Computed scores (0-100)
    overallScore: integer('overall_score').notNull(),
    marketScore: integer('market_score'),
    teamScore: integer('team_score'),
    productScore: integer('product_score'),
    tractionScore: integer('traction_score'),
    financialsScore: integer('financials_score'),

    // Match metadata
    matchReason: text('match_reason'),
    isSaved: boolean('is_saved').default(false).notNull(),
    viewedAt: timestamp('viewed_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // Indexes for common queries
    index('match_investor_score_idx').on(table.investorId, table.overallScore),
    index('match_startup_idx').on(table.startupId),
    index('match_investor_saved_idx').on(table.investorId, table.isSaved),

    // RLS: Investors see only their matches (investorId is the owner column)
    ...crudOwnPolicy(table.investorId),
  ],
).enableRLS();

// ============================================================================
// RELATIONS
// ============================================================================

export const investorThesisRelations = relations(investorThesis, ({ one }) => ({
  user: one(user, {
    fields: [investorThesis.userId],
    references: [user.id],
  }),
}));

export const scoringWeightRelations = relations(scoringWeight, ({ one }) => ({
  user: one(user, {
    fields: [scoringWeight.userId],
    references: [user.id],
  }),
}));

export const startupMatchRelations = relations(startupMatch, ({ one }) => ({
  investor: one(user, {
    fields: [startupMatch.investorId],
    references: [user.id],
  }),
  startup: one(startup, {
    fields: [startupMatch.startupId],
    references: [startup.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type InvestorThesis = typeof investorThesis.$inferSelect;
export type NewInvestorThesis = typeof investorThesis.$inferInsert;
export type ScoringWeight = typeof scoringWeight.$inferSelect;
export type NewScoringWeight = typeof scoringWeight.$inferInsert;
export type StartupMatch = typeof startupMatch.$inferSelect;
export type NewStartupMatch = typeof startupMatch.$inferInsert;
