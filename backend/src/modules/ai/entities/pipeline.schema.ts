import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
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
  PipelinePhase.ENRICHMENT,
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

export const pipelineAgentRunStatusEnum = pgEnum("pipeline_agent_run_status", [
  "running",
  "completed",
  "failed",
  "fallback",
]);

export const pipelineTraceKindEnum = pgEnum("pipeline_trace_kind", [
  "ai_agent",
  "phase_step",
]);

export const pipelineAgentRun = pgTable(
  "pipeline_agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pipelineRunId: text("pipeline_run_id")
      .notNull()
      .references(() => pipelineRun.pipelineRunId, { onDelete: "cascade" }),
    startupId: uuid("startup_id")
      .notNull()
      .references(() => startup.id, { onDelete: "cascade" }),
    phase: pipelinePhaseEnum("phase").notNull(),
    agentKey: text("agent_key").notNull(),
    traceKind: pipelineTraceKindEnum("trace_kind").notNull().default("ai_agent"),
    stepKey: text("step_key"),
    status: pipelineAgentRunStatusEnum("status").notNull(),
    attempt: integer("attempt").notNull().default(1),
    retryCount: integer("retry_count").notNull().default(0),
    usedFallback: boolean("used_fallback").notNull().default(false),
    inputPrompt: text("input_prompt"),
    inputJson: jsonb("input_json").$type<unknown>(),
    outputText: text("output_text"),
    outputJson: jsonb("output_json").$type<unknown>(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("pipeline_agent_runs_startup_idx").on(table.startupId),
    index("pipeline_agent_runs_pipeline_idx").on(table.pipelineRunId),
    index("pipeline_agent_runs_startup_phase_agent_idx").on(
      table.startupId,
      table.phase,
      table.agentKey,
    ),
    index("pipeline_agent_runs_startup_run_kind_phase_step_started_idx").on(
      table.startupId,
      table.pipelineRunId,
      table.traceKind,
      table.phase,
      table.stepKey,
      table.startedAt,
    ),
    index("pipeline_agent_runs_created_idx").on(table.createdAt),
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
  agentRuns: many(pipelineAgentRun),
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

export const pipelineAgentRunRelations = relations(pipelineAgentRun, ({ one }) => ({
  pipelineRun: one(pipelineRun, {
    fields: [pipelineAgentRun.pipelineRunId],
    references: [pipelineRun.pipelineRunId],
  }),
  startup: one(startup, {
    fields: [pipelineAgentRun.startupId],
    references: [startup.id],
  }),
}));

export type PipelineRun = typeof pipelineRun.$inferSelect;
export type NewPipelineRun = typeof pipelineRun.$inferInsert;
export type PipelineFailure = typeof pipelineFailure.$inferSelect;
export type NewPipelineFailure = typeof pipelineFailure.$inferInsert;
export type PipelineAgentRun = typeof pipelineAgentRun.$inferSelect;
export type NewPipelineAgentRun = typeof pipelineAgentRun.$inferInsert;
