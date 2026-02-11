import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "../../../auth/entities";
import { startupStageEnum } from "../../startup/entities/startup.schema";

export const aiPromptSurfaceEnum = pgEnum("ai_prompt_surface", [
  "pipeline",
  "clara",
]);

export const aiPromptStatusEnum = pgEnum("ai_prompt_status", [
  "draft",
  "published",
  "archived",
]);

export const aiPromptDefinition = pgTable(
  "ai_prompt_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 120 }).notNull().unique(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    surface: aiPromptSurfaceEnum("surface").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("ai_prompt_definition_key_idx").on(table.key)],
);

export const aiPromptRevision = pgTable(
  "ai_prompt_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => aiPromptDefinition.id, { onDelete: "cascade" }),
    stage: startupStageEnum("stage"),
    status: aiPromptStatusEnum("status").notNull().default("draft"),
    systemPrompt: text("system_prompt").notNull().default(""),
    userPrompt: text("user_prompt").notNull(),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
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
    index("ai_prompt_revision_definition_idx").on(table.definitionId),
    index("ai_prompt_revision_status_idx").on(table.status),
    index("ai_prompt_revision_stage_idx").on(table.stage),
    index("ai_prompt_revision_def_stage_status_idx").on(
      table.definitionId,
      table.stage,
      table.status,
    ),
  ],
);

export const aiPromptDefinitionRelations = relations(
  aiPromptDefinition,
  ({ many }) => ({
    revisions: many(aiPromptRevision),
  }),
);

export const aiPromptRevisionRelations = relations(aiPromptRevision, ({ one }) => ({
  definition: one(aiPromptDefinition, {
    fields: [aiPromptRevision.definitionId],
    references: [aiPromptDefinition.id],
  }),
  createdByUser: one(user, {
    fields: [aiPromptRevision.createdBy],
    references: [user.id],
  }),
  publishedByUser: one(user, {
    fields: [aiPromptRevision.publishedBy],
    references: [user.id],
  }),
}));

export type AiPromptDefinition = typeof aiPromptDefinition.$inferSelect;
export type NewAiPromptDefinition = typeof aiPromptDefinition.$inferInsert;
export type AiPromptRevision = typeof aiPromptRevision.$inferSelect;
export type NewAiPromptRevision = typeof aiPromptRevision.$inferInsert;
