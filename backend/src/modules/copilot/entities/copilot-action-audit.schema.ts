import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "../../../auth/entities/auth.schema";
import { claraConversation } from "../../clara/entities/clara-conversation.schema";
import { startup } from "../../startup/entities/startup.schema";

export const copilotActionAuditStatusEnum = pgEnum(
  "copilot_action_audit_status",
  ["proposed", "executed", "cancelled", "failed"],
);

export const copilotActionAudit = pgTable(
  "copilot_action_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").references(() => claraConversation.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email").notNull(),
    actorRole: text("actor_role"),
    channel: text("channel").notNull(),
    threadId: text("thread_id").notNull(),
    actionKey: text("action_key").notNull(),
    status: copilotActionAuditStatusEnum("status").notNull(),
    startupId: uuid("startup_id").references(() => startup.id, {
      onDelete: "set null",
    }),
    targetSummary: text("target_summary"),
    payload: jsonb("payload"),
    result: jsonb("result"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("copilot_action_audit_conversation_idx").on(table.conversationId),
    index("copilot_action_audit_actor_idx").on(table.actorUserId),
    index("copilot_action_audit_startup_idx").on(table.startupId),
    index("copilot_action_audit_thread_idx").on(table.threadId),
  ],
);

export type CopilotActionAuditRecord = typeof copilotActionAudit.$inferSelect;
export type NewCopilotActionAuditRecord = typeof copilotActionAudit.$inferInsert;
