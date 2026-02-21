import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar, boolean } from "drizzle-orm/pg-core";
import { user } from "../../../auth/entities";
import { aiPromptDefinition } from "./ai-prompt.schema";

export const aiFlowNodeKindEnum = pgEnum("ai_flow_node_kind", ["prompt", "system"]);

export const aiAgentConfig = pgTable(
  "ai_agent_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flowId: varchar("flow_id", { length: 50 }).notNull(),
    orchestratorNodeId: varchar("orchestrator_node_id", { length: 120 }).notNull(),
    agentKey: varchar("agent_key", { length: 120 }).notNull(),
    label: text("label").notNull(),
    description: text("description"),
    kind: aiFlowNodeKindEnum("kind").default("prompt").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    promptDefinitionId: uuid("prompt_definition_id").references(() => aiPromptDefinition.id),
    executionPhase: integer("execution_phase").default(1).notNull(),
    dependsOn: jsonb("depends_on").$type<string[]>().default([]).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isCustom: boolean("is_custom").default(false).notNull(),
    createdBy: uuid("created_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_agent_config_unique_agent_idx").on(
      table.flowId,
      table.orchestratorNodeId,
      table.agentKey,
    ),
    index("ai_agent_config_orchestrator_idx").on(
      table.flowId,
      table.orchestratorNodeId,
    ),
  ],
);

export type AiAgentConfig = typeof aiAgentConfig.$inferSelect;
export type NewAiAgentConfig = typeof aiAgentConfig.$inferInsert;
