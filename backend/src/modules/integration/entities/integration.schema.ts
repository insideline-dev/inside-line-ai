import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uuid,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { user } from '../../../auth/entities/auth.schema';

// ============================================================================
// ENUMS
// ============================================================================

export enum WebhookSource {
  AGENTMAIL = 'agentmail',
  TWILIO = 'twilio',
}

export const webhookSourceEnum = pgEnum('webhook_source', [
  WebhookSource.AGENTMAIL,
  WebhookSource.TWILIO,
]);

// ============================================================================
// INTEGRATION WEBHOOKS TABLE
// ============================================================================

/**
 * Webhook event log
 *
 * Stores incoming webhook payloads from external services
 * Used for debugging, replay, and audit trail
 *
 * RLS: Admin only
 */
export const integrationWebhook = pgTable(
  'integration_webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Webhook metadata
    source: webhookSourceEnum('source').notNull(),
    eventType: text('event_type').notNull(),

    // Payload storage
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),

    // Processing status
    processed: boolean('processed').default(false).notNull(),
    errorMessage: text('error_message'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('webhook_source_processed_created_idx').on(
      table.source,
      table.processed,
      table.createdAt,
    ),
  ],
);

// ============================================================================
// EMAIL THREADS TABLE
// ============================================================================

/**
 * AgentMail inbox threads
 *
 * Stores email thread metadata for the integrated inbox
 *
 * RLS: Users see only their threads
 */
export const emailThread = pgTable(
  'email_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // External reference
    threadId: text('thread_id').notNull(),

    // Thread metadata
    subject: text('subject'),
    participants: text('participants').array(),

    // Status tracking
    lastMessageAt: timestamp('last_message_at'),
    unreadCount: integer('unread_count').default(0).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('email_thread_user_last_message_idx').on(
      table.userId,
      table.lastMessageAt,
    ),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const emailThreadRelations = relations(emailThread, ({ one }) => ({
  user: one(user, {
    fields: [emailThread.userId],
    references: [user.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type IntegrationWebhook = typeof integrationWebhook.$inferSelect;
export type NewIntegrationWebhook = typeof integrationWebhook.$inferInsert;
export type EmailThread = typeof emailThread.$inferSelect;
export type NewEmailThread = typeof emailThread.$inferInsert;
