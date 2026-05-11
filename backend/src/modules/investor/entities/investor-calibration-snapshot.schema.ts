// DS-E11-F4-S1 — persisted calibration snapshot.
//
// Until this story the `getCalibrationSummary` aggregation re-scanned
// `investor_deal_decisions` on every read. That's cheap today (~tens of
// rows per investor) but it (a) wasted CPU on every admin view of the
// calibration tab and (b) made "recompute" structurally indistinguishable
// from "fetch", so the admin had no signal whether a new aggregate had
// actually run.
//
// This table stores the most recent computed summary so:
//   - `GET /admin/investors/:userId/calibration` returns the snapshot
//     (and computes-once on first access if no row exists yet).
//   - `POST /admin/investors/:userId/calibration/recompute` enqueues a
//     job that writes a new row and emits a WS event.
//
// One row per investor — recompute is an upsert; the `computedAt` and
// `jobId` fields move forward in place. We don't keep history because the
// underlying decision rows are append-only and replayable; the latest
// aggregate is the only state worth caching.

import {
  pgTable,
  text,
  uuid,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "../../../auth/entities/auth.schema";

export type CalibrationSnapshotStatus = "queued" | "running" | "completed" | "failed";

export const investorCalibrationSnapshot = pgTable(
  "investor_calibration_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    investorId: uuid("investor_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * Latest computed `CalibrationSummary`. JSONB so the shape can grow
     * (e.g. new mismatch categories) without a migration.
     */
    summary: jsonb("summary").$type<Record<string, unknown>>(),
    /**
     * Tracks the most recent recompute attempt. "completed" means the
     * `summary` field reflects this job; "failed" means `summary` may be
     * stale and `lastError` carries the reason. "queued"/"running" are
     * present while a job is in flight so the UI can pulse correctly.
     */
    status: text("status").$type<CalibrationSnapshotStatus>().notNull(),
    lastJobId: text("last_job_id"),
    lastError: text("last_error"),
    /**
     * Timestamp of the `summary` field. Distinct from `updatedAt` so a
     * failing recompute (which still bumps `updatedAt`) doesn't make the
     * cached payload look fresh.
     */
    computedAt: timestamp("computed_at", { withTimezone: true }),
    enqueuedAt: timestamp("enqueued_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("investor_calibration_snapshots_status_idx").on(table.status),
  ],
);

export const investorCalibrationSnapshotRelations = relations(
  investorCalibrationSnapshot,
  ({ one }) => ({
    investor: one(user, {
      fields: [investorCalibrationSnapshot.investorId],
      references: [user.id],
    }),
  }),
);

export type InvestorCalibrationSnapshotRow =
  typeof investorCalibrationSnapshot.$inferSelect;
export type NewInvestorCalibrationSnapshot =
  typeof investorCalibrationSnapshot.$inferInsert;
