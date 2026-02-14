import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';
import { user } from '../../../../auth/entities/auth.schema';
import { startup } from '../../../startup/entities/startup.schema';

export const investorInboxSubmission = pgTable('investor_inbox_submission', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  threadId: text('thread_id').notNull(),
  messageId: text('message_id').notNull(),
  inboxId: text('inbox_id').notNull(),
  subject: text('subject'),
  bodyText: text('body_text'),
  fromEmail: text('from_email').notNull(),
  attachmentKeys: jsonb('attachment_keys').$type<string[]>().default([]),
  suggestedCompanyName: text('suggested_company_name'),
  startupId: uuid('startup_id').references(() => startup.id),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type InvestorInboxSubmissionRecord = typeof investorInboxSubmission.$inferSelect;
export type NewInvestorInboxSubmissionRecord = typeof investorInboxSubmission.$inferInsert;
