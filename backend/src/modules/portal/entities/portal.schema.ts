import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uuid,
  uniqueIndex,
  pgEnum,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { user } from '../../../auth/entities/auth.schema';
import { startup } from '../../startup/entities/startup.schema';
import {
  appRole,
  currentUserId,
  isAdmin,
  crudOwnPolicy,
} from '../../../common/rls';

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
  'portal',
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

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('portal_slug_idx').on(table.slug),
    index('portal_user_idx').on(table.userId),

    // RLS: Owner CRUD
    ...crudOwnPolicy(table.userId),

    // RLS: Public can view active portals
    pgPolicy('portal_public_view', {
      for: 'select',
      to: appRole,
      using: sql`${table.isActive} = true`,
    }),
  ],
).enableRLS();

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
  'portal_submission',
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

    // RLS: Portal owners can view submissions
    pgPolicy('submission_portal_owner_select', {
      for: 'select',
      to: appRole,
      using: sql`EXISTS (
        SELECT 1 FROM portal
        WHERE portal.id = ${table.portalId}
        AND (portal.user_id = ${currentUserId} OR ${isAdmin})
      )`,
    }),
    pgPolicy('submission_portal_owner_update', {
      for: 'update',
      to: appRole,
      using: sql`EXISTS (
        SELECT 1 FROM portal
        WHERE portal.id = ${table.portalId}
        AND (portal.user_id = ${currentUserId} OR ${isAdmin})
      )`,
    }),
    // Startups can submit to portals
    pgPolicy('submission_startup_insert', {
      for: 'insert',
      to: appRole,
      withCheck: sql`EXISTS (
        SELECT 1 FROM startup
        WHERE startup.id = ${table.startupId}
        AND (startup.user_id = ${currentUserId} OR ${isAdmin})
      )`,
    }),
    // Startup owners can view their submissions
    pgPolicy('submission_startup_owner_select', {
      for: 'select',
      to: appRole,
      using: sql`EXISTS (
        SELECT 1 FROM startup
        WHERE startup.id = ${table.startupId}
        AND (startup.user_id = ${currentUserId} OR ${isAdmin})
      )`,
    }),
  ],
).enableRLS();

// ============================================================================
// RELATIONS
// ============================================================================

export const portalRelations = relations(portal, ({ one, many }) => ({
  user: one(user, {
    fields: [portal.userId],
    references: [user.id],
  }),
  submissions: many(portalSubmission),
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

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Portal = typeof portal.$inferSelect;
export type NewPortal = typeof portal.$inferInsert;
export type PortalSubmission = typeof portalSubmission.$inferSelect;
export type NewPortalSubmission = typeof portalSubmission.$inferInsert;
