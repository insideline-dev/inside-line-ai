import { pgTable, text, timestamp, boolean, uuid, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from '../../../../auth/entities/auth.schema';

// ============================================================================
// AGENTMAIL CONFIG TABLE
// ============================================================================

export const agentmailConfig = pgTable(
  'agentmail_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Inbox details
    inboxId: text('inbox_id').notNull(),
    inboxEmail: text('inbox_email'),
    displayName: text('display_name'),

    // Status
    isActive: boolean('is_active').default(true).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('agentmail_config_user_id_idx').on(table.userId),
    uniqueIndex('agentmail_config_inbox_id_idx').on(table.inboxId),
  ],
);

export type AgentMailConfigRecord = typeof agentmailConfig.$inferSelect;
export type NewAgentMailConfigRecord = typeof agentmailConfig.$inferInsert;
