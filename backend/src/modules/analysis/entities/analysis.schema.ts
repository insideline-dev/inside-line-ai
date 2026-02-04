import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uuid,
  pgEnum,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { startup } from '../../startup/entities/startup.schema';
import { appRole, currentUserId, isAdmin } from '../../../common/rls';

// ============================================================================
// ENUMS
// ============================================================================

export enum AnalysisJobType {
  SCORING = 'scoring',
  PDF = 'pdf',
  MATCHING = 'matching',
  MARKET_ANALYSIS = 'market_analysis',
}

export const analysisJobTypeEnum = pgEnum('analysis_job_type', [
  AnalysisJobType.SCORING,
  AnalysisJobType.PDF,
  AnalysisJobType.MATCHING,
  AnalysisJobType.MARKET_ANALYSIS,
]);

export enum AnalysisJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export const analysisJobStatusEnum = pgEnum('analysis_job_status', [
  AnalysisJobStatus.PENDING,
  AnalysisJobStatus.PROCESSING,
  AnalysisJobStatus.COMPLETED,
  AnalysisJobStatus.FAILED,
]);

export enum AnalysisJobPriority {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export const analysisJobPriorityEnum = pgEnum('analysis_job_priority', [
  AnalysisJobPriority.HIGH,
  AnalysisJobPriority.MEDIUM,
  AnalysisJobPriority.LOW,
]);

// ============================================================================
// ANALYSIS JOBS TABLE
// ============================================================================

/**
 * Async job tracking for analysis tasks
 *
 * Tracks various background jobs: scoring, PDF generation, matching, etc.
 *
 * RLS:
 * - Startup owners can view jobs for their startups
 * - Only admin/system can create/update jobs
 */
export const analysisJob = pgTable(
  'analysis_job',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    startupId: uuid('startup_id')
      .notNull()
      .references(() => startup.id, { onDelete: 'cascade' }),

    // Job configuration
    jobType: analysisJobTypeEnum('job_type').notNull(),
    status: analysisJobStatusEnum('status')
      .default(AnalysisJobStatus.PENDING)
      .notNull(),
    priority: analysisJobPriorityEnum('priority')
      .default(AnalysisJobPriority.MEDIUM)
      .notNull(),

    // Job results
    result: jsonb('result').$type<Record<string, unknown>>(),
    errorMessage: text('error_message'),

    // Timing
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('analysis_job_startup_type_idx').on(table.startupId, table.jobType),
    index('analysis_job_status_priority_created_idx').on(
      table.status,
      table.priority,
      table.createdAt,
    ),

    // RLS: Startup owner sees their jobs
    pgPolicy('analysis_job_startup_owner_select', {
      for: 'select',
      to: appRole,
      using: sql`EXISTS (
        SELECT 1 FROM startup
        WHERE startup.id = ${table.startupId}
        AND (startup.user_id = ${currentUserId} OR ${isAdmin})
      )`,
    }),
    // Only admin can manage jobs
    pgPolicy('analysis_job_admin_insert', {
      for: 'insert',
      to: appRole,
      withCheck: isAdmin,
    }),
    pgPolicy('analysis_job_admin_update', {
      for: 'update',
      to: appRole,
      using: isAdmin,
    }),
    pgPolicy('analysis_job_admin_delete', {
      for: 'delete',
      to: appRole,
      using: isAdmin,
    }),
  ],
).enableRLS();

// ============================================================================
// RELATIONS
// ============================================================================

export const analysisJobRelations = relations(analysisJob, ({ one }) => ({
  startup: one(startup, {
    fields: [analysisJob.startupId],
    references: [startup.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type AnalysisJob = typeof analysisJob.$inferSelect;
export type NewAnalysisJob = typeof analysisJob.$inferInsert;
