import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uuid,
  pgEnum,
  real,
} from 'drizzle-orm/pg-core';
import { startup } from '../../startup/entities/startup.schema';
import { user } from '../../../auth/entities/auth.schema';

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

export enum AdminReviewDecision {
  APPROVED = 'approved',
  REJECTED = 'rejected',
  NEEDS_REVISION = 'needs_revision',
}

export const adminReviewDecisionEnum = pgEnum('admin_review_decision', [
  AdminReviewDecision.APPROVED,
  AdminReviewDecision.REJECTED,
  AdminReviewDecision.NEEDS_REVISION,
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
  ],
);

// ============================================================================
// STARTUP EVALUATION TABLE
// ============================================================================

/**
 * 11-section AI analysis framework for startup evaluations
 *
 * Stores comprehensive analysis data including:
 * - Website & Deck Intelligence
 * - Team, Market, Product, Traction Analysis
 * - Business Model, GTM, Financials
 * - Competitive Advantage, Legal, Deal Terms, Exit Potential
 *
 * RLS:
 * - Startup owners can view their evaluation
 * - Only admin can create/update evaluations
 */
export const startupEvaluation = pgTable(
  'startup_evaluation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    startupId: uuid('startup_id')
      .notNull()
      .unique()
      .references(() => startup.id, { onDelete: 'cascade' }),

    // Website Intelligence
    websiteData: jsonb('website_data'),
    websiteScore: real('website_score'),
    messagingClarityScore: real('messaging_clarity_score'),

    // Deck Intelligence
    deckData: jsonb('deck_data'),
    deckScore: real('deck_score'),
    missingSlideFlags: jsonb('missing_slide_flags'),

    // 1. Team Analysis
    teamData: jsonb('team_data'),
    teamMemberEvaluations: jsonb('team_member_evaluations'),
    teamScore: real('team_score'),
    founderMarketFit: real('founder_market_fit'),
    executionRiskNotes: text('execution_risk_notes'),
    teamComposition: jsonb('team_composition'),

    // 2. Market Analysis
    marketData: jsonb('market_data'),
    marketScore: real('market_score'),
    tamValidation: jsonb('tam_validation'),
    marketCredibility: real('market_credibility'),

    // 3. Product/Technology Analysis
    productData: jsonb('product_data'),
    productScore: real('product_score'),
    productSummary: text('product_summary'),
    extractedScreenshots: jsonb('extracted_screenshots'),
    extractedDemoVideos: jsonb('extracted_demo_videos'),
    extractedFeatures: jsonb('extracted_features'),
    extractedTechStack: jsonb('extracted_tech_stack'),

    // 4. Traction Analysis
    tractionData: jsonb('traction_data'),
    tractionScore: real('traction_score'),
    momentumScore: real('momentum_score'),
    tractionCredibility: real('traction_credibility'),

    // 5. Business Model Analysis
    businessModelData: jsonb('business_model_data'),
    businessModelScore: real('business_model_score'),

    // 6. Go-To-Market Analysis
    gtmData: jsonb('gtm_data'),
    gtmScore: real('gtm_score'),

    // 7. Financials Analysis
    financialsData: jsonb('financials_data'),
    financialsScore: real('financials_score'),

    // 8. Competitive Advantage Analysis
    competitiveAdvantageData: jsonb('competitive_advantage_data'),
    competitiveAdvantageScore: real('competitive_advantage_score'),

    // 9. Legal/Regulatory Analysis
    legalData: jsonb('legal_data'),
    legalScore: real('legal_score'),

    // 10. Deal Terms Analysis
    dealTermsData: jsonb('deal_terms_data'),
    dealTermsScore: real('deal_terms_score'),

    // 11. Exit Potential Analysis
    exitPotentialData: jsonb('exit_potential_data'),
    exitPotentialScore: real('exit_potential_score'),

    // Section Scores Summary
    sectionScores: jsonb('section_scores'),

    // Final Scores
    overallScore: real('overall_score'),
    percentileRank: real('percentile_rank'),
    keyStrengths: jsonb('key_strengths'),
    keyRisks: jsonb('key_risks'),
    recommendations: jsonb('recommendations'),
    dataConfidenceNotes: text('data_confidence_notes'),

    // Executive Summary
    executiveSummary: text('executive_summary'),

    // Memos
    founderReport: jsonb('founder_report'),
    investorMemo: jsonb('investor_memo'),

    // Sources
    sources: jsonb('sources'),

    // Admin feedback
    adminFeedback: jsonb('admin_feedback'),

    // Cache fields
    webResearchData: jsonb('web_research_data'),
    deckContent: text('deck_content'),
    deckFilesHash: text('deck_files_hash'),
    comprehensiveResearchData: jsonb('comprehensive_research_data'),
    websiteScraped: text('website_scraped'),

    // Progress tracking
    analysisProgress: jsonb('analysis_progress'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('startup_evaluation_startup_idx').on(table.startupId),
  ],
);

// ============================================================================
// ADMIN REVIEW TABLE
// ============================================================================

/**
 * Admin review tracking for startup evaluations
 *
 * Records admin decisions, score overrides, and feedback
 *
 * RLS: Admin-only access
 */
export const adminReview = pgTable(
  'admin_review',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    startupId: uuid('startup_id')
      .notNull()
      .references(() => startup.id, { onDelete: 'cascade' }),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => user.id),

    scoreOverride: real('score_override'),
    memoEdits: jsonb('memo_edits'),
    adminNotes: text('admin_notes'),
    flaggedConcerns: jsonb('flagged_concerns'),
    investorVisibility: jsonb('investor_visibility'),

    decision: adminReviewDecisionEnum('decision'),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('admin_review_startup_idx').on(table.startupId),
    index('admin_review_reviewer_idx').on(table.reviewerId),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const analysisJobRelations = relations(analysisJob, ({ one }) => ({
  startup: one(startup, {
    fields: [analysisJob.startupId],
    references: [startup.id],
  }),
}));

export const startupEvaluationRelations = relations(startupEvaluation, ({ one }) => ({
  startup: one(startup, {
    fields: [startupEvaluation.startupId],
    references: [startup.id],
  }),
}));

export const adminReviewRelations = relations(adminReview, ({ one }) => ({
  startup: one(startup, {
    fields: [adminReview.startupId],
    references: [startup.id],
  }),
  reviewer: one(user, {
    fields: [adminReview.reviewerId],
    references: [user.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type AnalysisJob = typeof analysisJob.$inferSelect;
export type NewAnalysisJob = typeof analysisJob.$inferInsert;
export type StartupEvaluation = typeof startupEvaluation.$inferSelect;
export type NewStartupEvaluation = typeof startupEvaluation.$inferInsert;
export type AdminReview = typeof adminReview.$inferSelect;
export type NewAdminReview = typeof adminReview.$inferInsert;
