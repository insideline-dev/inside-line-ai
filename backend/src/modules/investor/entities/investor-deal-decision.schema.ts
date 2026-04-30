// DS-E11-F1-S1 — 30-second close/pass capture form persists here.
// The investor's verdict + reason tags + free-text notes form the
// foundation for the calibration loop (DS-E7-F3-S1) — that story can
// later read these rows to learn from disagreements between the
// system's triage decision and the investor's actual call.
//
// One row per (investor, startup, decidedAt). We don't unique on
// (investor, startup) because investors may revisit a deal and record
// a follow-up decision (e.g. initial pass → later advance after a
// founder check-in). Latest row wins for "current state" displays.

import {
  pgTable,
  pgEnum,
  text,
  uuid,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "../../../auth/entities/auth.schema";
import { startup } from "../../startup/entities/startup.schema";

export const investorDealVerdictEnum = pgEnum("investor_deal_verdict", [
  "advance",
  "pass",
  "hold",
]);

export const investorDealDecision = pgTable(
  "investor_deal_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startupId: uuid("startup_id")
      .notNull()
      .references(() => startup.id, { onDelete: "cascade" }),
    verdict: investorDealVerdictEnum("verdict").notNull(),
    /**
     * Investor-supplied tags from a fixed picker (e.g. `team`, `traction`,
     * `market`, `pricing`, `timing`). Free-form so the picker can grow
     * without a migration. Validated server-side to prevent abuse.
     */
    reasonTags: jsonb("reason_tags").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    /**
     * Optional snapshot of the latest triage classification at decision
     * time so the calibration loop can later compare investor verdict vs
     * model verdict without joining historical screening rows. Nullable
     * — if no triage decision exists yet, we still capture the verdict.
     */
    triageClassificationAtDecision: text(
      "triage_classification_at_decision",
    ),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Latest decision per (investor, startup) — the lookup the deal card
    // will hit on every render.
    index("investor_deal_decisions_investor_startup_idx").on(
      table.investorId,
      table.startupId,
      table.decidedAt,
    ),
    // Cross-startup analytics for one investor.
    index("investor_deal_decisions_investor_decided_idx").on(
      table.investorId,
      table.decidedAt,
    ),
  ],
);

export const investorDealDecisionRelations = relations(
  investorDealDecision,
  ({ one }) => ({
    investor: one(user, {
      fields: [investorDealDecision.investorId],
      references: [user.id],
    }),
    startup: one(startup, {
      fields: [investorDealDecision.startupId],
      references: [startup.id],
    }),
  }),
);

export type InvestorDealDecisionRow =
  typeof investorDealDecision.$inferSelect;
export type NewInvestorDealDecision =
  typeof investorDealDecision.$inferInsert;
export type InvestorDealVerdict = "advance" | "pass" | "hold";
