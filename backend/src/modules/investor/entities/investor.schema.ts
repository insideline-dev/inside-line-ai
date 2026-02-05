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
  jsonb,
  real,
  doublePrecision,
} from 'drizzle-orm/pg-core';
import { user } from '../../../auth/entities/auth.schema';
import {
  startup,
  StartupStage,
  startupStageEnum,
} from '../../startup/entities/startup.schema';

// ============================================================================
// TYPES
// ============================================================================

export type ScoringWeights = {
  team: number;
  market: number;
  product: number;
  traction: number;
  businessModel: number;
  gtm: number;
  financials: number;
  competitiveAdvantage: number;
  legal: number;
  dealTerms: number;
  exitPotential: number;
};

export type ScoringRationale = {
  team: string;
  market: string;
  product: string;
  traction: string;
  businessModel: string;
  gtm: string;
  financials: string;
  competitiveAdvantage: string;
  legal: string;
  dealTerms: string;
  exitPotential: string;
};

// ============================================================================
// INVESTOR PROFILE TABLE
// ============================================================================

/**
 * Fund metadata for an investor (separate from thesis)
 *
 * One profile per investor
 */
export const investorProfile = pgTable(
  'investor_profile',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),

    fundName: text('fund_name').notNull(),
    fundDescription: text('fund_description'),
    aum: text('aum'), // Assets under management as text (e.g., "$50M-100M")
    teamSize: integer('team_size'),
    website: text('website'),
    logoUrl: text('logo_url'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('investor_profile_user_idx').on(table.userId),
  ],
);

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

    // Business model preferences
    businessModels: text('business_models').array(),

    // Metric thresholds
    minRevenue: integer('min_revenue'),
    minGrowthRate: real('min_growth_rate'),
    minTeamSize: integer('min_team_size'),

    // Unstructured narrative
    thesisNarrative: text('thesis_narrative'),
    antiPortfolio: text('anti_portfolio'),

    // Fund info
    website: text('website'),
    fundSize: doublePrecision('fund_size'),

    // AI-generated summary
    thesisSummary: text('thesis_summary'),
    portfolioCompanies: jsonb('portfolio_companies'),
    thesisSummaryGeneratedAt: timestamp('thesis_summary_generated_at'),

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
  ],
);

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
  ],
);

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
  ],
);

// ============================================================================
// STAGE SCORING WEIGHT TABLE
// ============================================================================

/**
 * Default scoring weights per startup stage (admin-managed)
 *
 * These are system-wide defaults that investors can override
 */
export const stageScoringWeight = pgTable(
  'stage_scoring_weight',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stage: startupStageEnum('stage').notNull().unique(),
    weights: jsonb('weights').$type<ScoringWeights>().notNull(),
    rationale: jsonb('rationale').$type<ScoringRationale>().notNull(),
    overallRationale: text('overall_rationale'),
    lastModifiedBy: uuid('last_modified_by').references(() => user.id),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('stage_scoring_weight_stage_idx').on(table.stage),
  ],
);

// ============================================================================
// INVESTOR SCORING PREFERENCE TABLE
// ============================================================================

/**
 * Custom scoring weights per investor per stage
 *
 * Allows investors to override default stage weights
 */
export const investorScoringPreference = pgTable(
  'investor_scoring_preference',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    stage: startupStageEnum('stage').notNull(),
    useCustomWeights: boolean('use_custom_weights').default(false).notNull(),
    customWeights: jsonb('custom_weights').$type<ScoringWeights>(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('investor_scoring_preference_investor_stage_idx').on(
      table.investorId,
      table.stage,
    ),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const investorProfileRelations = relations(
  investorProfile,
  ({ one }) => ({
    user: one(user, {
      fields: [investorProfile.userId],
      references: [user.id],
    }),
  }),
);

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

export const stageScoringWeightRelations = relations(
  stageScoringWeight,
  ({ one }) => ({
    modifier: one(user, {
      fields: [stageScoringWeight.lastModifiedBy],
      references: [user.id],
    }),
  }),
);

export const investorScoringPreferenceRelations = relations(
  investorScoringPreference,
  ({ one }) => ({
    investor: one(user, {
      fields: [investorScoringPreference.investorId],
      references: [user.id],
    }),
  }),
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type InvestorProfile = typeof investorProfile.$inferSelect;
export type NewInvestorProfile = typeof investorProfile.$inferInsert;
export type InvestorThesis = typeof investorThesis.$inferSelect;
export type NewInvestorThesis = typeof investorThesis.$inferInsert;
export type ScoringWeight = typeof scoringWeight.$inferSelect;
export type NewScoringWeight = typeof scoringWeight.$inferInsert;
export type StartupMatch = typeof startupMatch.$inferSelect;
export type NewStartupMatch = typeof startupMatch.$inferInsert;
export type StageScoringWeight = typeof stageScoringWeight.$inferSelect;
export type NewStageScoringWeight = typeof stageScoringWeight.$inferInsert;
export type InvestorScoringPreference =
  typeof investorScoringPreference.$inferSelect;
export type NewInvestorScoringPreference =
  typeof investorScoringPreference.$inferInsert;
