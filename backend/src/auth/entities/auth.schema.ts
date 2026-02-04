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
import { crudOwnPolicy } from '../../common/rls';

/**
 * User Role Enum
 * Defines the available roles in the system
 */
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

/**
 * PostgreSQL enum type for user roles
 */
export const userRoleEnum = pgEnum('user_role', [
  UserRole.USER,
  UserRole.ADMIN,
]);

/**
 * SECURITY: Role Management Model
 *
 * This schema implements a hierarchical role system:
 * - 'user': Regular user (default role)
 * - 'admin': Administrator with full system access
 *
 * CRITICAL SECURITY RULES:
 * 1. Roles MUST ONLY be changed via AdminUserService methods
 * 2. No API endpoint can accept 'role' in user input DTOs
 * 3. All role changes are logged to roleAudit table for compliance
 * 4. The system enforces at least one admin must exist (see demoteAdminToUser)
 * 5. RLS policies grant admins full access: isOwnerOrAdmin checks apply
 *
 * Column-Level RLS:
 * PostgreSQL doesn't support column-level RLS natively, so we enforce
 * column-level protection at the application layer:
 * - UpdateProfileSchema intentionally excludes 'role' field
 * - Only /admin/promote and /admin/demote can change roles
 *
 * If you add new endpoints that modify user data:
 * - NEVER accept 'role' in the request body
 * - ALWAYS validate at the service layer
 * - NEVER allow users to update their own role
 */

export const user = pgTable(
  'user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    role: userRoleEnum('role').default(UserRole.USER).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [...crudOwnPolicy(table.id)],
).enableRLS();

// NOTE: Session table removed - using stateless JWT tokens instead

export const account = pgTable(
  'account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // CRITICAL: Prevents duplicate OAuth accounts (same provider + account combo)
    uniqueIndex('account_provider_accountId_idx').on(
      table.providerId,
      table.accountId,
    ),
    index('account_userId_idx').on(table.userId),
    ...crudOwnPolicy(table.userId),
  ],
).enableRLS();

export const verification = pgTable(
  'verification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    // Type: 'email' for email verification, 'magic_link' for passwordless login
    type: text('type', { enum: ['email', 'magic_link'] })
      .default('magic_link')
      .notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

// Refresh token storage for token rotation
export const refreshToken = pgTable(
  'refresh_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    // Family ID for detecting token reuse attacks
    family: text('family').notNull(),
    // Whether this token has been used (rotated)
    used: boolean('used').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('refresh_token_userId_idx').on(table.userId),
    index('refresh_token_family_idx').on(table.family),
    ...crudOwnPolicy(table.userId),
  ],
).enableRLS();

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  refreshTokens: many(refreshToken),
}));

export const refreshTokenRelations = relations(refreshToken, ({ one }) => ({
  user: one(user, {
    fields: [refreshToken.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

/**
 * Role audit table - tracks all role changes for compliance and security
 * SECURITY: This table logs who changed what role when - essential for security audits
 */
export const roleAudit = pgTable(
  'role_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetUserId: uuid('target_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    oldRole: userRoleEnum('old_role').notNull(),
    newRole: userRoleEnum('new_role').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('role_audit_target_user_id_idx').on(table.targetUserId),
    index('role_audit_admin_user_id_idx').on(table.adminUserId),
    index('role_audit_created_at_idx').on(table.createdAt),
    // NOTE: No RLS on audit table - only admins can query it via service
  ],
);

export const roleAuditRelations = relations(roleAudit, ({ one }) => ({
  targetUser: one(user, {
    fields: [roleAudit.targetUserId],
    references: [user.id],
    relationName: 'roleAuditTarget',
  }),
  adminUser: one(user, {
    fields: [roleAudit.adminUserId],
    references: [user.id],
    relationName: 'roleAuditAdmin',
  }),
}));
