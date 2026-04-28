import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { startup } from "../../startup/entities";
import { pipelineRun } from "./pipeline.schema";

/**
 * Frozen snapshot of a single lens at the moment a triage decision was made.
 * Persisted as JSONB so that re-running screening with new prompts/models does
 * NOT mutate historical decisions — DD must be able to audit "why did this
 * deal get classified ADVANCE on day X?".
 */
export interface ScreeningDecisionLensSnapshot {
  key: string;
  score: number;
  signal: "advance" | "review" | "reject";
}

/**
 * Deal-level triage classification produced after the SCREENING phase
 * persists per-lens results (see `startup_lens_result`). One row per
 * (startupId, decision) — the latest row by `createdAt` is the live
 * classification.
 *
 * `policyVersion` lets us evolve the triage formula (DS-E7-F1 v1 = 1) without
 * a DB migration; bump it in the service when the rule set changes so old
 * decisions remain interpretable.
 */
export const screeningDecision = pgTable(
  "screening_decision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startupId: uuid("startup_id")
      .notNull()
      .references(() => startup.id, { onDelete: "cascade" }),
    pipelineRunId: text("pipeline_run_id").references(
      () => pipelineRun.pipelineRunId,
      { onDelete: "set null" },
    ),
    classification: text("classification").notNull(),
    overallScore: integer("overall_score").notNull(),
    reasonCodes: jsonb("reason_codes")
      .$type<string[]>()
      .notNull()
      .default([]),
    lensSnapshot: jsonb("lens_snapshot")
      .$type<ScreeningDecisionLensSnapshot[]>()
      .notNull()
      .default([]),
    policyVersion: integer("policy_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("screening_decision_startup_created_idx").on(
      table.startupId,
      table.createdAt.desc(),
    ),
    index("screening_decision_run_idx").on(table.pipelineRunId),
  ],
);

export const screeningDecisionRelations = relations(
  screeningDecision,
  ({ one }) => ({
    startup: one(startup, {
      fields: [screeningDecision.startupId],
      references: [startup.id],
    }),
    pipelineRun: one(pipelineRun, {
      fields: [screeningDecision.pipelineRunId],
      references: [pipelineRun.pipelineRunId],
    }),
  }),
);

export type ScreeningDecisionRow = typeof screeningDecision.$inferSelect;
export type NewScreeningDecisionRow = typeof screeningDecision.$inferInsert;
