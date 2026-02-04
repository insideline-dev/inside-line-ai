import { relations, sql } from 'drizzle-orm';
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
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { user } from '../../../auth/entities/auth.schema';
import { appRole, currentUserId, isAdmin, crudOwnPolicy } from '../../../common/rls';

// ============================================================================
// ENUMS
// ============================================================================

export enum StartupStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export const startupStatusEnum = pgEnum('startup_status', [
  StartupStatus.DRAFT,
  StartupStatus.SUBMITTED,
  StartupStatus.APPROVED,
  StartupStatus.REJECTED,
]);

export enum StartupStage {
  PRE_SEED = 'pre-seed',
  SEED = 'seed',
  SERIES_A = 'series-a',
  SERIES_B_PLUS = 'series-b+',
}

export const startupStageEnum = pgEnum('startup_stage', [
  StartupStage.PRE_SEED,
  StartupStage.SEED,
  StartupStage.SERIES_A,
  StartupStage.SERIES_B_PLUS,
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
  'startup',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Basic info
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    tagline: text('tagline').notNull(),
    description: text('description').notNull(),
    website: text('website').notNull(),
    location: text('location').notNull(),
    industry: text('industry').notNull(),
    stage: startupStageEnum('stage').notNull(),
    fundingTarget: integer('funding_target').notNull(),
    teamSize: integer('team_size').notNull(),

    // Status workflow
    status: startupStatusEnum('status').default(StartupStatus.DRAFT).notNull(),

    // Media URLs
    pitchDeckUrl: text('pitch_deck_url'),
    demoUrl: text('demo_url'),
    logoUrl: text('logo_url'),

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

    // RLS: Owner CRUD
    ...crudOwnPolicy(table.userId),

    // RLS: Investors can view approved startups
    pgPolicy('startup_investor_view', {
      for: 'select',
      to: appRole,
      using: sql`${table.status} = 'approved'`,
    }),
  ],
).enableRLS();

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
  'startup_draft',
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

    // RLS: Only owner can access their drafts
    ...crudOwnPolicy(table.userId),
  ],
).enableRLS();

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
