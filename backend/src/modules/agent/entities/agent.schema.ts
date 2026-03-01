import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  index,
  uuid,
  uniqueIndex,
  pgEnum,
  jsonb,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from '../../../auth/entities/auth.schema';
import { startup } from '../../startup/entities/startup.schema';
import { investorProfile } from '../../investor/entities/investor.schema';

// ============================================================================
// ENUMS
// ============================================================================

export enum ChannelType {
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
}
export const channelTypeEnum = pgEnum('channel_type', [
  ChannelType.EMAIL,
  ChannelType.WHATSAPP,
  ChannelType.SMS,
]);

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}
export const messageDirectionEnum = pgEnum('message_direction', [
  MessageDirection.INBOUND,
  MessageDirection.OUTBOUND,
]);

export enum ConversationStatus {
  ACTIVE = 'active',
  WAITING_RESPONSE = 'waiting_response',
  RESOLVED = 'resolved',
  ARCHIVED = 'archived',
}
export const conversationStatusEnum = pgEnum('conversation_status', [
  ConversationStatus.ACTIVE,
  ConversationStatus.WAITING_RESPONSE,
  ConversationStatus.RESOLVED,
  ConversationStatus.ARCHIVED,
]);

export enum MessageIntent {
  QUESTION = 'question',
  SUBMISSION = 'submission',
  FOLLOW_UP = 'follow_up',
  GREETING = 'greeting',
  UNKNOWN = 'unknown',
}
export const messageIntentEnum = pgEnum('message_intent', [
  MessageIntent.QUESTION,
  MessageIntent.SUBMISSION,
  MessageIntent.FOLLOW_UP,
  MessageIntent.GREETING,
  MessageIntent.UNKNOWN,
]);

export enum AgentCategory {
  ORCHESTRATOR = 'orchestrator',
  ANALYSIS = 'analysis',
  SYNTHESIS = 'synthesis',
}
export const agentCategoryEnum = pgEnum('agent_category', [
  AgentCategory.ORCHESTRATOR,
  AgentCategory.ANALYSIS,
  AgentCategory.SYNTHESIS,
]);

// ============================================================================
// AGENT PROMPTS TABLE
// ============================================================================

export const agentPrompt = pgTable(
  'agent_prompts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentKey: varchar('agent_key', { length: 50 }).notNull().unique(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    category: agentCategoryEnum('category').notNull(),

    // Prompt configuration
    systemPrompt: text('system_prompt').notNull(),
    humanPrompt: text('human_prompt').notNull(),

    // Agent metadata
    tools: jsonb('tools').$type<string[]>(),
    inputs: jsonb('inputs').$type<{ key: string; description: string; required: boolean }[]>(),
    outputs: jsonb('outputs').$type<{ key: string; type: string; description: string }[]>(),

    // Flow configuration
    parentAgent: text('parent_agent'),
    executionOrder: integer('execution_order').default(0),
    isParallel: boolean('is_parallel').default(true),

    // Version tracking
    version: integer('version').default(1).notNull(),
    lastModifiedBy: uuid('last_modified_by').references(() => user.id),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('agent_prompt_key_idx').on(table.agentKey),
  ],
);

// ============================================================================
// AGENT CONVERSATIONS TABLE
// ============================================================================

export const agentConversation = pgTable(
  'agent_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Investor identification (null if unknown)
    investorProfileId: uuid('investor_profile_id').references(() => investorProfile.id),

    // Contact identifiers
    senderEmail: text('sender_email'),
    senderPhone: text('sender_phone'),
    senderName: text('sender_name'),

    // External thread identifiers
    emailThreadId: text('email_thread_id'),
    whatsappThreadId: text('whatsapp_thread_id'),

    // Current state
    status: conversationStatusEnum('status').notNull().default(ConversationStatus.ACTIVE),
    lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),

    // Context tracking
    currentStartupId: uuid('current_startup_id').references(() => startup.id),
    context: jsonb('context').$type<{
      lastIntent: string;
      mentionedStartups: string[];
      pendingQuestions: string[];
      extractedData: Record<string, unknown>;
      conversationSummary: string;
    }>(),

    // Metadata
    messageCount: integer('message_count').default(0).notNull(),
    isAuthenticated: boolean('is_authenticated').default(false).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('agent_conversation_investor_idx').on(table.investorProfileId),
    index('agent_conversation_email_idx').on(table.senderEmail),
    index('agent_conversation_status_idx').on(table.status),
  ],
);

// ============================================================================
// AGENT MESSAGES TABLE
// ============================================================================

export const agentMessage = pgTable(
  'agent_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => agentConversation.id, { onDelete: 'cascade' }),

    // Message content
    channel: channelTypeEnum('channel').notNull(),
    direction: messageDirectionEnum('direction').notNull(),
    content: text('content').notNull(),

    // AI analysis
    intent: messageIntentEnum('intent'),
    extractedEntities: jsonb('extracted_entities').$type<{
      startupNames: string[];
      founderEmails: string[];
      founderNames: string[];
      urls: string[];
      attachments: { name: string; type: string; url?: string }[];
    }>(),

    // External references
    externalMessageId: text('external_message_id'),
    inReplyToMessageId: uuid('in_reply_to_message_id'),

    // Attachments
    attachments: jsonb('attachments').$type<{
      filename: string;
      contentType: string;
      url?: string;
      path?: string;
    }[]>(),

    // AI response metadata
    aiResponseMetadata: jsonb('ai_response_metadata').$type<{
      model: string;
      promptTokens: number;
      completionTokens: number;
      processingTimeMs: number;
      agentDecision: string;
    }>(),

    // Delivery status
    deliveryStatus: text('delivery_status'),
    deliveryError: text('delivery_error'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('agent_message_conversation_idx').on(table.conversationId),
    index('agent_message_created_idx').on(table.createdAt),
  ],
);

// ============================================================================
// AGENT INBOXES TABLE
// ============================================================================

export const agentInbox = pgTable(
  'agent_inboxes',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // AgentMail inbox
    agentMailInboxId: text('agentmail_inbox_id'),
    emailAddress: text('email_address'),

    // Twilio WhatsApp
    twilioPhoneNumber: text('twilio_phone_number'),

    // Settings
    isActive: boolean('is_active').default(true).notNull(),
    welcomeMessage: text('welcome_message'),
    autoReplyEnabled: boolean('auto_reply_enabled').default(true).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (_table) => [
  ],
);

// ============================================================================
// ATTACHMENT DOWNLOADS TABLE
// ============================================================================

export const attachmentDownload = pgTable(
  'attachment_downloads',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // AgentMail identifiers
    inboxId: text('inbox_id').notNull(),
    messageId: text('message_id').notNull(),
    attachmentId: text('attachment_id').notNull(),

    // File metadata
    filename: text('filename'),
    contentType: text('content_type'),

    // Download URL
    downloadUrl: text('download_url').notNull(),

    // Status tracking
    status: text('status').notNull().default('pending'),
    errorMessage: text('error_message'),

    // Result
    savedPath: text('saved_path'),
    fileSize: integer('file_size'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('attachment_download_inbox_message_idx').on(table.inboxId, table.messageId),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const agentPromptRelations = relations(agentPrompt, ({ one }) => ({
  modifier: one(user, {
    fields: [agentPrompt.lastModifiedBy],
    references: [user.id],
  }),
}));

export const agentConversationRelations = relations(agentConversation, ({ one, many }) => ({
  investorProfile: one(investorProfile, {
    fields: [agentConversation.investorProfileId],
    references: [investorProfile.id],
  }),
  currentStartup: one(startup, {
    fields: [agentConversation.currentStartupId],
    references: [startup.id],
  }),
  messages: many(agentMessage),
}));

export const agentMessageRelations = relations(agentMessage, ({ one }) => ({
  conversation: one(agentConversation, {
    fields: [agentMessage.conversationId],
    references: [agentConversation.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type AgentPrompt = typeof agentPrompt.$inferSelect;
export type NewAgentPrompt = typeof agentPrompt.$inferInsert;
export type AgentConversation = typeof agentConversation.$inferSelect;
export type NewAgentConversation = typeof agentConversation.$inferInsert;
export type AgentMessage = typeof agentMessage.$inferSelect;
export type NewAgentMessage = typeof agentMessage.$inferInsert;
export type AgentInbox = typeof agentInbox.$inferSelect;
export type NewAgentInbox = typeof agentInbox.$inferInsert;
export type AttachmentDownload = typeof attachmentDownload.$inferSelect;
export type NewAttachmentDownload = typeof attachmentDownload.$inferInsert;
