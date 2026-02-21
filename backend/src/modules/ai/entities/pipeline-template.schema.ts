import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { user } from "../../../auth/entities";

export const pipelineTemplateStatusEnum = pgEnum("pipeline_template_status", [
  "draft",
  "published",
  "archived",
]);

export const pipelineTemplate = pgTable(
  "pipeline_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flowId: varchar("flow_id", { length: 50 }).notNull(),
    version: integer("version").notNull().default(1),
    status: pipelineTemplateStatusEnum("status").notNull().default("draft"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
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
    uniqueIndex("pipeline_template_flow_version_unique").on(table.flowId, table.version),
    index("pipeline_template_flow_status_idx").on(table.flowId, table.status),
  ],
);

export type PipelineTemplate = typeof pipelineTemplate.$inferSelect;
export type NewPipelineTemplate = typeof pipelineTemplate.$inferInsert;
