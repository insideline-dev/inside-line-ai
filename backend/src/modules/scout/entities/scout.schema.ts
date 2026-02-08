import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  uuid,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { user } from '../../../auth/entities/auth.schema';
import { startup } from '../../startup/entities/startup.schema';

// ============================================================================
// ENUMS
// ============================================================================

export enum ScoutApplicationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export const scoutApplicationStatusEnum = pgEnum('scout_application_status', [
  ScoutApplicationStatus.PENDING,
  ScoutApplicationStatus.APPROVED,
  ScoutApplicationStatus.REJECTED,
]);

// ============================================================================
// SCOUT APPLICATIONS TABLE
// ============================================================================

/**
 * Scout vetting workflow
 *
 * Users apply to become scouts for specific investors
 * Investors review and approve/reject applications
 *
 * RLS:
 * - Scouts see their own applications
 * - Target investors see applications to them
 * - Admins see all
 */
export const scoutApplication = pgTable(
  'scout_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Application details
    name: text('name'),
    email: text('email'),
    linkedinUrl: text('linkedin_url'),
    experience: text('experience'),
    motivation: text('motivation'),
    dealflowSources: text('dealflow_sources'),
    portfolio: text('portfolio').array(),

    // Review workflow
    status: scoutApplicationStatusEnum('status')
      .default(ScoutApplicationStatus.PENDING)
      .notNull(),
    reviewedAt: timestamp('reviewed_at'),
    reviewedBy: uuid('reviewed_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    rejectionReason: text('rejection_reason'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('scout_application_user_idx').on(table.userId),
    index('scout_application_investor_status_idx').on(
      table.investorId,
      table.status,
    ),
  ],
);

// ============================================================================
// SCOUT SUBMISSIONS TABLE
// ============================================================================

/**
 * Scout referrals
 *
 * Scouts refer startups to investors with commission tracking
 *
 * RLS:
 * - Scouts see their own submissions
 * - Target investors see submissions to them
 */
export const scoutSubmission = pgTable(
  'scout_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scoutId: uuid('scout_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    startupId: uuid('startup_id')
      .notNull()
      .references(() => startup.id, { onDelete: 'cascade' }),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Commission tracking (basis points, e.g., 100 = 1%)
    commissionRate: integer('commission_rate'),
    notes: text('notes'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('scout_submission_scout_idx').on(table.scoutId),
    index('scout_submission_investor_created_idx').on(
      table.investorId,
      table.createdAt,
    ),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const scoutApplicationRelations = relations(
  scoutApplication,
  ({ one }) => ({
    user: one(user, {
      fields: [scoutApplication.userId],
      references: [user.id],
      relationName: 'scoutApplicationUser',
    }),
    investor: one(user, {
      fields: [scoutApplication.investorId],
      references: [user.id],
      relationName: 'scoutApplicationInvestor',
    }),
    reviewer: one(user, {
      fields: [scoutApplication.reviewedBy],
      references: [user.id],
      relationName: 'scoutApplicationReviewer',
    }),
  }),
);

export const scoutSubmissionRelations = relations(
  scoutSubmission,
  ({ one }) => ({
    scout: one(user, {
      fields: [scoutSubmission.scoutId],
      references: [user.id],
      relationName: 'scoutSubmissionScout',
    }),
    startup: one(startup, {
      fields: [scoutSubmission.startupId],
      references: [startup.id],
    }),
    investor: one(user, {
      fields: [scoutSubmission.investorId],
      references: [user.id],
      relationName: 'scoutSubmissionInvestor',
    }),
  }),
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ScoutApplication = typeof scoutApplication.$inferSelect;
export type NewScoutApplication = typeof scoutApplication.$inferInsert;
export type ScoutSubmission = typeof scoutSubmission.$inferSelect;
export type NewScoutSubmission = typeof scoutSubmission.$inferInsert;
