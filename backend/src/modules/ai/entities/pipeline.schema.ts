import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "../../../auth/entities";
import { startup } from "../../startup/entities";
import { PipelinePhase, PipelineStatus } from "../interfaces/pipeline.interface";

export const pipelineRunStatusEnum = pgEnum("pipeline_run_status", [
  PipelineStatus.RUNNING,
  PipelineStatus.COMPLETED,
  PipelineStatus.FAILED,
  PipelineStatus.CANCELLED,
]);

export const pipelinePhaseEnum = pgEnum("pipeline_phase", [
  PipelinePhase.EXTRACTION,
  PipelinePhase.SCRAPING,
  PipelinePhase.RESEARCH,
  PipelinePhase.EVALUATION,
  PipelinePhase.SYNTHESIS,
]);

export const pipelineRun = pgTable(
  "pipeline_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pipelineRunId: text("pipeline_run_id").notNull().unique(),
    startupId: uuid("startup_id")
      .notNull()
      .references(() => startup.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: pipelineRunStatusEnum("status")
      .notNull()
      .default(PipelineStatus.RUNNING),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    error: jsonb("error").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("pipeline_runs_startup_idx").on(table.startupId),
    index("pipeline_runs_status_started_idx").on(table.status, table.startedAt),
  ],
);

export const pipelineFailure = pgTable(
  "pipeline_failures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pipelineRunId: text("pipeline_run_id")
      .notNull()
      .references(() => pipelineRun.pipelineRunId, {
        onDelete: "cascade",
      }),
    startupId: uuid("startup_id")
      .notNull()
      .references(() => startup.id, { onDelete: "cascade" }),
    phase: pipelinePhaseEnum("phase").notNull(),
    jobData: jsonb("job_data").$type<Record<string, unknown>>(),
    error: jsonb("error").$type<Record<string, unknown>>().notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
  },
  (table) => [
    index("pipeline_failures_pipeline_idx").on(table.pipelineRunId),
    index("pipeline_failures_startup_phase_idx").on(table.startupId, table.phase),
  ],
);

export const pipelineRunRelations = relations(pipelineRun, ({ one, many }) => ({
  startup: one(startup, {
    fields: [pipelineRun.startupId],
    references: [startup.id],
  }),
  user: one(user, {
    fields: [pipelineRun.userId],
    references: [user.id],
  }),
  failures: many(pipelineFailure),
}));

export const pipelineFailureRelations = relations(pipelineFailure, ({ one }) => ({
  pipelineRun: one(pipelineRun, {
    fields: [pipelineFailure.pipelineRunId],
    references: [pipelineRun.pipelineRunId],
  }),
  startup: one(startup, {
    fields: [pipelineFailure.startupId],
    references: [startup.id],
  }),
}));

export type PipelineRun = typeof pipelineRun.$inferSelect;
export type NewPipelineRun = typeof pipelineRun.$inferInsert;
export type PipelineFailure = typeof pipelineFailure.$inferSelect;
export type NewPipelineFailure = typeof pipelineFailure.$inferInsert;
