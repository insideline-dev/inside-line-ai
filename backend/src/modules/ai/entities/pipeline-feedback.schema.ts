import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "../../../auth/entities";
import { startup } from "../../startup/entities";
import { pipelinePhaseEnum } from "./pipeline.schema";

export const pipelineFeedback = pgTable(
  "pipeline_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startupId: uuid("startup_id")
      .notNull()
      .references(() => startup.id, { onDelete: "cascade" }),
    phase: pipelinePhaseEnum("phase").notNull(),
    agentKey: text("agent_key"),
    feedback: text("feedback").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("pipeline_feedback_startup_phase_idx").on(table.startupId, table.phase),
    index("pipeline_feedback_startup_agent_idx").on(table.startupId, table.agentKey),
    index("pipeline_feedback_consumed_idx").on(table.consumedAt),
  ],
);

export const pipelineFeedbackRelations = relations(
  pipelineFeedback,
  ({ one }) => ({
    startup: one(startup, {
      fields: [pipelineFeedback.startupId],
      references: [startup.id],
    }),
    creator: one(user, {
      fields: [pipelineFeedback.createdBy],
      references: [user.id],
    }),
  }),
);

export type PipelineFeedback = typeof pipelineFeedback.$inferSelect;
export type NewPipelineFeedback = typeof pipelineFeedback.$inferInsert;
