import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  integer,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "../../../auth/entities";

export const pipelineFlowConfigStatusEnum = pgEnum(
  "pipeline_flow_config_status",
  ["draft", "published", "archived"],
);

export const pipelineFlowConfig = pgTable(
  "pipeline_flow_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    status: pipelineFlowConfigStatusEnum("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    flowDefinition: jsonb("flow_definition")
      .$type<Record<string, unknown>>()
      .notNull(),
    pipelineConfig: jsonb("pipeline_config")
      .$type<Record<string, unknown>>()
      .notNull(),
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
    index("pipeline_flow_config_status_idx").on(table.status),
    index("pipeline_flow_config_created_at_idx").on(table.createdAt),
  ],
);

export type PipelineFlowConfig = typeof pipelineFlowConfig.$inferSelect;
export type NewPipelineFlowConfig = typeof pipelineFlowConfig.$inferInsert;
