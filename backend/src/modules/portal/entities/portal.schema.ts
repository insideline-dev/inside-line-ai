import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uuid,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { user } from '../../../auth/entities/auth.schema';
import { startup } from '../../startup/entities/startup.schema';

// ============================================================================
// ENUMS
// ============================================================================

export enum PortalSubmissionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export const portalSubmissionStatusEnum = pgEnum('portal_submission_status', [
  PortalSubmissionStatus.PENDING,
  PortalSubmissionStatus.APPROVED,
  PortalSubmissionStatus.REJECTED,
]);

/**
 * Abuse-prevention posture for a public apply link.
 *
 * - `strict`: per-portal-per-founder dedupe window + per-email rate limit
 *   active. Use when the portal sees lots of bot/founder spray traffic.
 * - `standard` (default): per-IP rate limit only. Founders are free to
 *   resubmit if they realise they made a mistake.
 * - `lenient`: no per-email dedupe or per-email rate limit. Per-IP rate
 *   limit still applies (defense in depth — bots still get throttled).
 */
export enum PortalLinkIntegrity {
  STRICT = 'strict',
  STANDARD = 'standard',
  LENIENT = 'lenient',
}

export const portalLinkIntegrityEnum = pgEnum('portal_link_integrity', [
  PortalLinkIntegrity.STRICT,
  PortalLinkIntegrity.STANDARD,
  PortalLinkIntegrity.LENIENT,
]);

/**
 * Outcomes recorded for every attempt on a public portal apply link.
 *
 * - `accepted`: a portal submission row was created.
 * - `duplicate_within_window`: matched an existing pending submission for the
 *   same portal (per-email-rate or canonical-name) inside the dedupe window.
 * - `rate_limited`: per-IP burst threshold tripped.
 * - `merged`: reserved for future re-submission UX (kept for forward
 *   compatibility).
 */
export enum PortalSubmissionAuditOutcome {
  ACCEPTED = 'accepted',
  DUPLICATE_WITHIN_WINDOW = 'duplicate_within_window',
  RATE_LIMITED = 'rate_limited',
  MERGED = 'merged',
}

export const portalSubmissionAuditOutcomeEnum = pgEnum(
  'portal_submission_audit_outcome',
  [
    PortalSubmissionAuditOutcome.ACCEPTED,
    PortalSubmissionAuditOutcome.DUPLICATE_WITHIN_WINDOW,
    PortalSubmissionAuditOutcome.RATE_LIMITED,
    PortalSubmissionAuditOutcome.MERGED,
  ],
);

// ============================================================================
// PORTALS TABLE
// ============================================================================

/**
 * Custom investor portals
 *
 * Allows investors to create branded submission portals
 * Public routing via unique slug
 *
 * RLS:
 * - Owners can manage their portals
 * - Public can view active portals
 */
export const portal = pgTable(
  'portals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Portal branding
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    logoUrl: text('logo_url'),
    brandColor: text('brand_color'),

    // Status
    isActive: boolean('is_active').default(true).notNull(),

    // Abuse-prevention posture (DS-E1-F7-S1)
    linkIntegrity: portalLinkIntegrityEnum('link_integrity')
      .default(PortalLinkIntegrity.STANDARD)
      .notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('portal_slug_idx').on(table.slug),
    index('portal_user_idx').on(table.userId),
  ],
);

// ============================================================================
// PORTAL SUBMISSIONS TABLE
// ============================================================================

/**
 * Submissions through investor portals
 *
 * Links startups to portals they've submitted through
 *
 * RLS:
 * - Portal owners can view submissions to their portals
 * - Startup owners can submit and view their own submissions
 */
export const portalSubmission = pgTable(
  'portal_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    portalId: uuid('portal_id')
      .notNull()
      .references(() => portal.id, { onDelete: 'cascade' }),
    startupId: uuid('startup_id')
      .notNull()
      .references(() => startup.id, { onDelete: 'cascade' }),

    // Status
    status: portalSubmissionStatusEnum('status')
      .default(PortalSubmissionStatus.PENDING)
      .notNull(),

    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  },
  (table) => [
    index('portal_submission_portal_submitted_idx').on(
      table.portalId,
      table.submittedAt,
    ),
    index('portal_submission_startup_idx').on(table.startupId),
  ],
);

// ============================================================================
// PORTAL SUBMISSION AUDIT TABLE (DS-E1-F7-S1)
// ============================================================================

/**
 * Append-only audit log of every public portal submission attempt — including
 * blocked ones. Indexed so we can answer "how many submissions did this IP
 * make in the last 5 minutes" and "did this founder already submit a fuzzy
 * match in the last 30 days" cheaply.
 *
 * The `founderEmailHash` is SHA-256 of the lowercased+trimmed email so we can
 * index without leaking PII into pg_indexes. The raw `founderEmail` is also
 * stored for admin visibility (the portal sees it on accepted rows anyway).
 */
export const portalSubmissionAudit = pgTable(
  'portal_submission_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    portalId: uuid('portal_id')
      .notNull()
      .references(() => portal.id, { onDelete: 'cascade' }),

    founderEmail: text('founder_email'),
    founderEmailHash: text('founder_email_hash').notNull(),

    ipAddress: text('ip_address'),

    submittedCompanyName: text('submitted_company_name'),
    normalizedCompanyName: text('normalized_company_name'),

    outcome: portalSubmissionAuditOutcomeEnum('outcome').notNull(),

    // For ACCEPTED rows: the newly-created startup id. For
    // DUPLICATE_WITHIN_WINDOW rows: the matched original startup id (so admin
    // can see "this attempt collided with that record").
    startupId: uuid('startup_id'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('portal_submission_audit_portal_email_created_idx').on(
      table.portalId,
      table.founderEmailHash,
      table.createdAt,
    ),
    index('portal_submission_audit_portal_normalized_created_idx').on(
      table.portalId,
      table.normalizedCompanyName,
      table.createdAt,
    ),
    index('portal_submission_audit_ip_created_idx').on(
      table.ipAddress,
      table.createdAt,
    ),
    index('portal_submission_audit_portal_created_idx').on(
      table.portalId,
      table.createdAt,
    ),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const portalRelations = relations(portal, ({ one, many }) => ({
  user: one(user, {
    fields: [portal.userId],
    references: [user.id],
  }),
  submissions: many(portalSubmission),
  audits: many(portalSubmissionAudit),
}));

export const portalSubmissionRelations = relations(
  portalSubmission,
  ({ one }) => ({
    portal: one(portal, {
      fields: [portalSubmission.portalId],
      references: [portal.id],
    }),
    startup: one(startup, {
      fields: [portalSubmission.startupId],
      references: [startup.id],
    }),
  }),
);

export const portalSubmissionAuditRelations = relations(
  portalSubmissionAudit,
  ({ one }) => ({
    portal: one(portal, {
      fields: [portalSubmissionAudit.portalId],
      references: [portal.id],
    }),
  }),
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Portal = typeof portal.$inferSelect;
export type NewPortal = typeof portal.$inferInsert;
export type PortalSubmission = typeof portalSubmission.$inferSelect;
export type NewPortalSubmission = typeof portalSubmission.$inferInsert;
export type PortalSubmissionAudit = typeof portalSubmissionAudit.$inferSelect;
export type NewPortalSubmissionAudit =
  typeof portalSubmissionAudit.$inferInsert;
