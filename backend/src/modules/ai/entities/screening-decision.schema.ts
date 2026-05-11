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
/**
 * Active lens versions at the time a decision was made (DS-E2-F1-S2).
 * Persisted as JSONB so historical decisions are replayable on the exact
 * lens versions that produced them — flipping `LENS_ACTIVE_VERSION_TEAM`
 * later doesn't rewrite history.
 *
 * Shape: `{ market: '1', team: '1', traction: '1' }` — keys are logical
 * lens keys, values are the lens-class version string.
 */
export type ScreeningDecisionLensVersions = Record<string, string>;

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
    /**
     * Active lens versions at decision time. DS-E2-F1-S2 — empty object on
     * pre-S2 rows; new rows always include every active lens key.
     */
    lensVersions: jsonb("lens_versions")
      .$type<ScreeningDecisionLensVersions>()
      .notNull()
      .default({}),
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
