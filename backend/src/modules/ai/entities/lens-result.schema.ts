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
 * Evidence item produced by a screening lens.
 * Persisted as JSONB; mirrored by the Zod LensEvidenceSchema in
 * `schemas/lens/lens-output.schema.ts`. Keep both in sync.
 */
export interface LensEvidence {
  claim: string;
  source: string;
  confidence: "low" | "medium" | "high";
  sourceType?:
    | "deck_page"
    | "public_url"
    | "enrichment_call"
    | "research_source"
    | "internal_trace";
  sourceLabel?: string;
  sourceRef?: string;
  url?: string;
  pageNumber?: number;
  quote?: string;
}

/**
 * One row per (startupId, lensKey, pipelineRunId). The screening processor
 * upserts these on every pipeline run. `lens_version` and `prompt_version`
 * (DS-E2-F1-S2) capture the version pair that produced each row so historical
 * decisions stay replayable when the active lens version flips. Defaults to
 * `'1'` so existing rows roll forward without backfill.
 */
export const startupLensResult = pgTable(
  "startup_lens_result",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startupId: uuid("startup_id")
      .notNull()
      .references(() => startup.id, { onDelete: "cascade" }),
    pipelineRunId: text("pipeline_run_id").references(
      () => pipelineRun.pipelineRunId,
      { onDelete: "set null" },
    ),
    lensKey: text("lens_key").notNull(),
    score: integer("score").notNull(),
    signal: text("signal").notNull(),
    rationale: text("rationale").notNull(),
    evidence: jsonb("evidence")
      .$type<LensEvidence[]>()
      .notNull()
      .default([]),
    modelId: text("model_id").notNull(),
    promptKey: text("prompt_key").notNull(),
    lensVersion: text("lens_version").notNull().default("1"),
    promptVersion: text("prompt_version").notNull().default("1"),
    latencyMs: integer("latency_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("startup_lens_result_startup_lens_idx").on(
      table.startupId,
      table.lensKey,
    ),
    index("startup_lens_result_run_idx").on(table.pipelineRunId),
  ],
);

export const startupLensResultRelations = relations(
  startupLensResult,
  ({ one }) => ({
    startup: one(startup, {
      fields: [startupLensResult.startupId],
      references: [startup.id],
    }),
    pipelineRun: one(pipelineRun, {
      fields: [startupLensResult.pipelineRunId],
      references: [pipelineRun.pipelineRunId],
    }),
  }),
);

export type StartupLensResult = typeof startupLensResult.$inferSelect;
export type NewStartupLensResult = typeof startupLensResult.$inferInsert;
