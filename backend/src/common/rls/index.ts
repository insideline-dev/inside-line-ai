import { sql } from 'drizzle-orm';
import { pgPolicy } from 'drizzle-orm/pg-core';
import { pgRole } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Define application role (the role your NestJS app connects as)
 * In a standard setup, this is often the default user, but we define it explicitly for RLS.
 */
export const appRole = pgRole('app_user').existing();

/**
 * Helper to get current user ID from session variable
 * This variable is set via SET LOCAL app.current_user_id in a transaction/middleware.
 */
export const currentUserId = sql`current_setting('app.current_user_id', true)::uuid`;

/**
 * Helper to get current user role from session variable
 */
export const currentUserRole = sql`current_setting('app.current_user_role', true)`;

/**
 * Helper to check if current user is an admin
 */
export const isAdmin = sql`${currentUserRole} = 'admin'`;

/**
 * Helper to check if column matches current user or if user is admin
 */
export const isOwnerOrAdmin = (userIdColumn: AnyPgColumn) =>
  sql`${userIdColumn} = ${currentUserId} OR ${isAdmin}`;

/**
 * Standard read-only policy (user can only SELECT their own rows, admins see all)
 */
export const readOwnPolicy = (userIdColumn: AnyPgColumn) =>
  pgPolicy('read_own', {
    for: 'select',
    to: appRole,
    using: isOwnerOrAdmin(userIdColumn),
  });

/**
 * Standard full CRUD policy (user can SELECT/INSERT/UPDATE/DELETE their own rows, admins see all)
 */
export const crudOwnPolicy = (userIdColumn: AnyPgColumn) => [
  pgPolicy('select_own', {
    for: 'select',
    to: appRole,
    using: isOwnerOrAdmin(userIdColumn),
  }),
  pgPolicy('insert_own', {
    for: 'insert',
    to: appRole,
    withCheck: isOwnerOrAdmin(userIdColumn),
  }),
  pgPolicy('update_own', {
    for: 'update',
    to: appRole,
    using: isOwnerOrAdmin(userIdColumn),
    withCheck: isOwnerOrAdmin(userIdColumn),
  }),
  pgPolicy('delete_own', {
    for: 'delete',
    to: appRole,
    using: isOwnerOrAdmin(userIdColumn),
  }),
];
