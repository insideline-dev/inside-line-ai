import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uuid,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { user } from '../../auth/entities/auth.schema';

// ============================================================================
// ENUMS
// ============================================================================

export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  MATCH = 'match',
}

export const notificationTypeEnum = pgEnum('notification_type', [
  NotificationType.INFO,
  NotificationType.SUCCESS,
  NotificationType.WARNING,
  NotificationType.ERROR,
  NotificationType.MATCH,
]);

// ============================================================================
// NOTIFICATIONS TABLE
// ============================================================================

/**
 * User notifications
 *
 * Supports different notification types with optional navigation links
 *
 * RLS: Users see only their own notifications
 */
export const notification = pgTable(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Notification content
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: notificationTypeEnum('type').default(NotificationType.INFO).notNull(),

    // Optional navigation link
    link: text('link'),

    // Read status
    read: boolean('read').default(false).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // Index for fetching user's unread notifications
    index('notification_user_read_created_idx').on(
      table.userId,
      table.read,
      table.createdAt,
    ),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, {
    fields: [notification.userId],
    references: [user.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;
