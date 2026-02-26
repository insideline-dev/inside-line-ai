import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "../../../auth/entities";
import { startupStageEnum } from "../../startup/entities/startup.schema";
import type { SchemaDescriptor } from "../interfaces/schema.interface";
import { aiPromptDefinition, aiPromptStatusEnum } from "./ai-prompt.schema";

export const aiAgentSchemaRevision = pgTable(
  "ai_agent_schema_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => aiPromptDefinition.id, { onDelete: "cascade" }),
    stage: startupStageEnum("stage"),
    status: aiPromptStatusEnum("status").default("draft").notNull(),
    schemaJson: jsonb("schema_json").$type<SchemaDescriptor>().notNull(),
    version: integer("version").default(1).notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => user.id),
    publishedBy: uuid("published_by").references(() => user.id),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("ai_agent_schema_rev_definition_idx").on(table.definitionId),
    index("ai_agent_schema_rev_def_stage_status_idx").on(
      table.definitionId,
      table.stage,
      table.status,
    ),
  ],
);

export const aiAgentSchemaRevisionRelations = relations(
  aiAgentSchemaRevision,
  ({ one }) => ({
    definition: one(aiPromptDefinition, {
      fields: [aiAgentSchemaRevision.definitionId],
      references: [aiPromptDefinition.id],
    }),
    createdByUser: one(user, {
      fields: [aiAgentSchemaRevision.createdBy],
      references: [user.id],
    }),
    publishedByUser: one(user, {
      fields: [aiAgentSchemaRevision.publishedBy],
      references: [user.id],
    }),
  }),
);

export type AiAgentSchemaRevision = typeof aiAgentSchemaRevision.$inferSelect;
export type NewAiAgentSchemaRevision = typeof aiAgentSchemaRevision.$inferInsert;
