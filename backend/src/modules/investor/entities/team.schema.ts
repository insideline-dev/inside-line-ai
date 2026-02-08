import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { user } from '../../../auth/entities/auth.schema';
import { investorThesis } from './investor.schema';

// ============================================================================
// ENUMS
// ============================================================================

export const teamRoleEnum = pgEnum('team_role', ['member', 'admin']);

export const inviteStatusEnum = pgEnum('invite_status', [
  'pending',
  'accepted',
  'expired',
  'cancelled',
]);

// ============================================================================
// TEAM INVITES TABLE
// ============================================================================

/**
 * Team invitations for investor thesis collaboration
 *
 * Invites expire after 7 days
 * Only the investor thesis owner can create invites
 */
export const teamInvite = pgTable(
  'team_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investorThesisId: uuid('investor_thesis_id')
      .notNull()
      .references(() => investorThesis.id, { onDelete: 'cascade' }),
    invitedByUserId: uuid('invited_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    email: text('email').notNull(),
    role: teamRoleEnum('role').notNull(),
    inviteCode: text('invite_code').notNull().unique(),
    status: inviteStatusEnum('status').notNull().default('pending'),

    expiresAt: timestamp('expires_at').notNull(),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    acceptedAt: timestamp('accepted_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('team_invite_thesis_idx').on(table.investorThesisId),
    index('team_invite_code_idx').on(table.inviteCode),
    index('team_invite_email_idx').on(table.email),
  ],
);

// ============================================================================
// TEAM MEMBERS TABLE
// ============================================================================

/**
 * Team members with access to investor thesis
 *
 * Members can view and collaborate on the thesis
 * Admins can additionally manage team members
 */
export const teamMember = pgTable(
  'team_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investorThesisId: uuid('investor_thesis_id')
      .notNull()
      .references(() => investorThesis.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    email: text('email').notNull(),
    role: teamRoleEnum('role').notNull(),

    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => [
    index('team_member_thesis_idx').on(table.investorThesisId),
    index('team_member_user_idx').on(table.userId),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const teamInviteRelations = relations(teamInvite, ({ one }) => ({
  investorThesis: one(investorThesis, {
    fields: [teamInvite.investorThesisId],
    references: [investorThesis.id],
  }),
  invitedBy: one(user, {
    fields: [teamInvite.invitedByUserId],
    references: [user.id],
  }),
  acceptedBy: one(user, {
    fields: [teamInvite.acceptedByUserId],
    references: [user.id],
  }),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  investorThesis: one(investorThesis, {
    fields: [teamMember.investorThesisId],
    references: [investorThesis.id],
  }),
  user: one(user, {
    fields: [teamMember.userId],
    references: [user.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type TeamInvite = typeof teamInvite.$inferSelect;
export type NewTeamInvite = typeof teamInvite.$inferInsert;
export type TeamMember = typeof teamMember.$inferSelect;
export type NewTeamMember = typeof teamMember.$inferInsert;
export type TeamRole = (typeof teamRoleEnum.enumValues)[number];
export type InviteStatus = (typeof inviteStatusEnum.enumValues)[number];
