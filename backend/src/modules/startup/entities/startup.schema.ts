import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  index,
  integer,
  jsonb,
  uniqueIndex,
  doublePrecision,
  real,
  boolean,
} from 'drizzle-orm/pg-core';
import { user, userRoleEnum, UserRole } from '../../../auth/entities/auth.schema';

// ============================================================================
// ENUMS
// ============================================================================

export enum StartupStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  ANALYZING = 'analyzing',
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export const startupStatusEnum = pgEnum('startup_status', [
  StartupStatus.DRAFT,
  StartupStatus.SUBMITTED,
  StartupStatus.ANALYZING,
  StartupStatus.PENDING_REVIEW,
  StartupStatus.APPROVED,
  StartupStatus.REJECTED,
]);

export enum StartupStage {
  PRE_SEED = 'pre_seed',
  SEED = 'seed',
  SERIES_A = 'series_a',
  SERIES_B = 'series_b',
  SERIES_C = 'series_c',
  SERIES_D = 'series_d',
  SERIES_E = 'series_e',
  SERIES_F_PLUS = 'series_f_plus',
}

export const startupStageEnum = pgEnum('startup_stage', [
  StartupStage.PRE_SEED,
  StartupStage.SEED,
  StartupStage.SERIES_A,
  StartupStage.SERIES_B,
  StartupStage.SERIES_C,
  StartupStage.SERIES_D,
  StartupStage.SERIES_E,
  StartupStage.SERIES_F_PLUS,
]);

export enum TRL {
  IDEA = 'idea',
  MVP = 'mvp',
  SCALING = 'scaling',
  MATURE = 'mature',
}

export const trlEnum = pgEnum('trl', [TRL.IDEA, TRL.MVP, TRL.SCALING, TRL.MATURE]);

export enum RaiseType {
  SAFE = 'safe',
  CONVERTIBLE_NOTE = 'convertible_note',
  EQUITY = 'equity',
  SAFE_EQUITY = 'safe_equity',
  UNDECIDED = 'undecided',
}

export const raiseTypeEnum = pgEnum('raise_type', [
  RaiseType.SAFE,
  RaiseType.CONVERTIBLE_NOTE,
  RaiseType.EQUITY,
  RaiseType.SAFE_EQUITY,
  RaiseType.UNDECIDED,
]);

export enum ValuationType {
  PRE_MONEY = 'pre_money',
  POST_MONEY = 'post_money',
}

export const valuationTypeEnum = pgEnum('valuation_type', [
  ValuationType.PRE_MONEY,
  ValuationType.POST_MONEY,
]);

// ============================================================================
// STARTUP TABLE
// ============================================================================

/**
 * Main startup entity - stores startup submissions from founders
 *
 * Status workflow: draft -> submitted -> approved/rejected
 *
 * RLS Policy:
 * - Founders see their own startups (via crudOwnPolicy)
 * - Investors see only approved startups (via startup_investor_view)
 * - Admins see all (via isOwnerOrAdmin in crudOwnPolicy)
 */
export const startup = pgTable(
  'startups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Submission tracking
    submittedByRole: userRoleEnum('submitted_by_role').default(UserRole.FOUNDER),
    scoutId: uuid('scout_id').references(() => user.id),
    isPrivate: boolean('is_private').default(false),

    // Basic info
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    tagline: text('tagline').notNull(),
    description: text('description').notNull(),
    website: text('website').notNull(),
    location: text('location').notNull(),
    normalizedRegion: text('normalized_region'),
    industry: text('industry').notNull(),

    // Sector details
    sectorIndustryGroup: text('sector_industry_group'),
    sectorIndustry: text('sector_industry'),

    stage: startupStageEnum('stage').notNull(),
    fundingTarget: integer('funding_target').notNull(),
    teamSize: integer('team_size').notNull(),

    // Status workflow
    status: startupStatusEnum('status').default(StartupStatus.DRAFT).notNull(),

    // Media URLs
    pitchDeckUrl: text('pitch_deck_url'),
    demoUrl: text('demo_url'),
    logoUrl: text('logo_url'),

    // Files
    pitchDeckPath: text('pitch_deck_path'),
    files: jsonb('files').$type<{ path: string; name: string; type: string }[]>(),
    teamMembers: jsonb('team_members').$type<{ name: string; role: string; linkedinUrl: string }[]>(),

    // Round details
    roundCurrency: text('round_currency').default('USD'),
    valuation: doublePrecision('valuation'),
    valuationKnown: boolean('valuation_known').default(true),
    valuationType: valuationTypeEnum('valuation_type'),
    raiseType: raiseTypeEnum('raise_type'),
    leadSecured: boolean('lead_secured'),
    leadInvestorName: text('lead_investor_name'),

    // Contact info
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    contactPhoneCountryCode: text('contact_phone_country_code'),

    // Previous funding
    hasPreviousFunding: boolean('has_previous_funding'),
    previousFundingAmount: doublePrecision('previous_funding_amount'),
    previousFundingCurrency: text('previous_funding_currency'),
    previousInvestors: text('previous_investors'),
    previousRoundType: text('previous_round_type'),

    // Scores
    overallScore: real('overall_score'),
    percentileRank: real('percentile_rank'),

    // Product showcase
    productDescription: text('product_description'),
    technologyReadinessLevel: trlEnum('technology_readiness_level'),
    productScreenshots: jsonb('product_screenshots').$type<string[]>(),
    demoVideoUrl: text('demo_video_url'),

    // Workflow timestamps
    submittedAt: timestamp('submitted_at'),
    approvedAt: timestamp('approved_at'),
    rejectedAt: timestamp('rejected_at'),
    rejectionReason: text('rejection_reason'),

    // Standard timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // Indexes for common queries
    index('startup_userId_status_idx').on(table.userId, table.status),
    index('startup_status_created_idx').on(table.status, table.createdAt),
    index('startup_industry_idx').on(table.industry),
    index('startup_stage_idx').on(table.stage),
    index('startup_location_idx').on(table.location),
    uniqueIndex('startup_slug_idx').on(table.slug),
  ],
);

// ============================================================================
// STARTUP DRAFT TABLE
// ============================================================================

/**
 * Autosave system for startup applications
 *
 * One draft per startup (upsert pattern via unique constraint)
 * Stores partial/incomplete data as JSONB
 */
export const startupDraft = pgTable(
  'startup_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    startupId: uuid('startup_id')
      .notNull()
      .references(() => startup.id, { onDelete: 'cascade' })
      .unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Draft data stored as JSONB for flexibility
    draftData: jsonb('draft_data').$type<Record<string, unknown>>().notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('startup_draft_startupId_updated_idx').on(
      table.startupId,
      table.updatedAt,
    ),
    index('startup_draft_userId_idx').on(table.userId),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const startupRelations = relations(startup, ({ one, many }) => ({
  user: one(user, {
    fields: [startup.userId],
    references: [user.id],
  }),
  draft: one(startupDraft),
}));

export const startupDraftRelations = relations(startupDraft, ({ one }) => ({
  startup: one(startup, {
    fields: [startupDraft.startupId],
    references: [startup.id],
  }),
  user: one(user, {
    fields: [startupDraft.userId],
    references: [user.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Startup = typeof startup.$inferSelect;
export type NewStartup = typeof startup.$inferInsert;
export type StartupDraft = typeof startupDraft.$inferSelect;
export type NewStartupDraft = typeof startupDraft.$inferInsert;
