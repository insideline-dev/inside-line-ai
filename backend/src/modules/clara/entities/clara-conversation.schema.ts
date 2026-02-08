import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "../../../auth/entities/auth.schema";
import { startup } from "../../startup/entities/startup.schema";
import { ConversationStatus } from "../interfaces/clara.interface";

export const claraConversationStatusEnum = pgEnum("clara_conversation_status", [
  ConversationStatus.ACTIVE,
  ConversationStatus.AWAITING_INFO,
  ConversationStatus.PROCESSING,
  ConversationStatus.COMPLETED,
  ConversationStatus.ARCHIVED,
]);

export const claraConversation = pgTable(
  "clara_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: text("thread_id").notNull(),
    investorUserId: uuid("investor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    investorEmail: text("investor_email").notNull(),
    investorName: text("investor_name"),
    startupId: uuid("startup_id").references(() => startup.id, {
      onDelete: "set null",
    }),
    status: claraConversationStatusEnum("status")
      .default(ConversationStatus.ACTIVE)
      .notNull(),
    lastIntent: text("last_intent"),
    messageCount: integer("message_count").default(0).notNull(),
    context: jsonb("context").default({}).notNull(),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("clara_conv_thread_id_idx").on(table.threadId),
    index("clara_conv_investor_email_idx").on(table.investorEmail),
    index("clara_conv_startup_id_idx").on(table.startupId),
    index("clara_conv_status_idx").on(table.status),
  ],
);

export type ClaraConversationRecord =
  typeof claraConversation.$inferSelect;
export type NewClaraConversationRecord =
  typeof claraConversation.$inferInsert;
