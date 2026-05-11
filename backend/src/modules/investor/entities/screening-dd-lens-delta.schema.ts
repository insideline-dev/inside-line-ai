// DS-E11-F2-S1 — DD-vs-screening lens delta history.
//
// When the evaluation phase completes for a deal that was previously
// screened, the three overlapping lenses (`team`, `market`, `traction`)
// each produce a fresh DD score that can be compared against the
// screening lens score from the same pipeline run. The delta
// (`ddScore - screeningScore`, signed) is the "machine vs machine"
// calibration signal that lets the platform learn whether screening was
// systematically optimistic or harsh on a given lens.
//
// One row per (startupId, pipelineRunId, lensKey). Re-running evaluation
// on the same pipeline run is idempotent — the unique index lets the
// service `INSERT ... ON CONFLICT DO UPDATE` without ballooning history.
//
// `investorId` is denormalized from `startup_matches` at compute time so
// the calibration summary can aggregate per-investor without a join on
// every read. Nullable because evaluation may complete for a startup
// before any investor match exists; those rows still get persisted (the
// global lens-delta record stays useful for system-wide telemetry) but
// they're filtered out of investor-scoped summaries.
//
// Lens version fields (`screeningLensVersion`, `ddAgentVersion`) capture
// which prompt/model produced each side so later retunes can be replayed
// against historical deltas.

import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "../../../auth/entities/auth.schema";
import { startup } from "../../startup/entities/startup.schema";
import { pipelineRun } from "../../ai/entities/pipeline.schema";

export const screeningDdLensDelta = pgTable(
  "screening_dd_lens_delta",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startupId: uuid("startup_id")
      .notNull()
      .references(() => startup.id, { onDelete: "cascade" }),
    pipelineRunId: text("pipeline_run_id").references(
      () => pipelineRun.pipelineRunId,
      { onDelete: "set null" },
    ),
    /**
     * Denormalized — `startup_matches.investor_id` at compute time.
     * Null when no investor match exists yet; the row still persists for
     * the system-wide lens-delta record but is excluded from per-investor
     * summaries (`getLatestDeltasForInvestor`).
     */
    investorId: uuid("investor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /**
     * Lens key — `team`, `market`, or `traction` (the three overlapping
     * lenses between screening and DD).
     */
    lensKey: text("lens_key").notNull(),
    screeningScore: integer("screening_score").notNull(),
    ddScore: integer("dd_score").notNull(),
    /**
     * `ddScore - screeningScore`, signed. A positive value means DD
     * rated the lens higher than screening did. Stored explicitly (not
     * computed at read time) so historical rows survive schema-level
     * tweaks to the delta convention.
     */
    delta: integer("delta").notNull(),
    /**
     * Versioning lineage — which screening lens prompt/model produced
     * the screening score, which DD evaluation agent prompt/model
     * produced the DD score. Free-form so future versions don't need a
     * migration. Nullable because pre-#17 / pre-#2 runs may not have
     * stamped these.
     */
    screeningLensVersion: text("screening_lens_version"),
    ddAgentVersion: text("dd_agent_version"),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("screening_dd_lens_delta_unique_idx").on(
      table.startupId,
      table.pipelineRunId,
      table.lensKey,
    ),
    index("screening_dd_lens_delta_investor_idx").on(
      table.investorId,
      table.computedAt.desc(),
    ),
    index("screening_dd_lens_delta_startup_idx").on(
      table.startupId,
      table.computedAt.desc(),
    ),
  ],
);

export const screeningDdLensDeltaRelations = relations(
  screeningDdLensDelta,
  ({ one }) => ({
    startup: one(startup, {
      fields: [screeningDdLensDelta.startupId],
      references: [startup.id],
    }),
    pipelineRun: one(pipelineRun, {
      fields: [screeningDdLensDelta.pipelineRunId],
      references: [pipelineRun.pipelineRunId],
    }),
    investor: one(user, {
      fields: [screeningDdLensDelta.investorId],
      references: [user.id],
    }),
  }),
);

export type ScreeningDdLensDeltaRow = typeof screeningDdLensDelta.$inferSelect;
export type NewScreeningDdLensDelta = typeof screeningDdLensDelta.$inferInsert;
export type LensDeltaKey = "team" | "market" | "traction";
export const LENS_DELTA_KEYS: readonly LensDeltaKey[] = [
  "team",
  "market",
  "traction",
] as const;
