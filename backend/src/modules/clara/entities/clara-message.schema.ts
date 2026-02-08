import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  uuid,
  real,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { claraConversation } from "./clara-conversation.schema";
import { MessageDirection } from "../interfaces/clara.interface";

export const claraMessageDirectionEnum = pgEnum("clara_message_direction", [
  MessageDirection.INBOUND,
  MessageDirection.OUTBOUND,
]);

export const claraMessage = pgTable(
  "clara_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => claraConversation.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    direction: claraMessageDirectionEnum("direction").notNull(),
    fromEmail: text("from_email").notNull(),
    subject: text("subject"),
    bodyText: text("body_text"),
    intent: text("intent"),
    intentConfidence: real("intent_confidence"),
    attachments: jsonb("attachments"),
    processed: boolean("processed").default(false).notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("clara_msg_conversation_id_idx").on(table.conversationId),
    index("clara_msg_message_id_idx").on(table.messageId),
    index("clara_msg_direction_idx").on(table.direction),
  ],
);

export type ClaraMessageRecord = typeof claraMessage.$inferSelect;
export type NewClaraMessageRecord = typeof claraMessage.$inferInsert;
