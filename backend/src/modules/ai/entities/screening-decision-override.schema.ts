import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "../../../auth/entities/auth.schema";
import { startup } from "../../startup/entities";
import { screeningDecision } from "./screening-decision.schema";

export type ScreeningVerdict = "review" | "advance" | "reject";

export interface ScreeningDecisionOverrideMetadata {
  source?: "investor" | "admin";
  [key: string]: unknown;
}

export const screeningDecisionOverride = pgTable(
  "screening_decision_override",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    screeningDecisionId: uuid("screening_decision_id")
      .notNull()
      .references(() => screeningDecision.id, { onDelete: "cascade" }),
    startupId: uuid("startup_id")
      .notNull()
      .references(() => startup.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    actorRole: text("actor_role").notNull(),
    previousClassification: text("previous_classification").notNull(),
    newClassification: text("new_classification").notNull(),
    reason: text("reason").notNull(),
    reasonCode: text("reason_code"),
    metadata: jsonb("metadata")
      .$type<ScreeningDecisionOverrideMetadata>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("screening_decision_override_decision_created_idx").on(
      table.screeningDecisionId,
      table.createdAt.desc(),
    ),
    index("screening_decision_override_startup_created_idx").on(
      table.startupId,
      table.createdAt.desc(),
    ),
    index("screening_decision_override_actor_created_idx").on(
      table.actorUserId,
      table.createdAt.desc(),
    ),
  ],
);

export const screeningDecisionOverrideRelations = relations(
  screeningDecisionOverride,
  ({ one }) => ({
    screeningDecision: one(screeningDecision, {
      fields: [screeningDecisionOverride.screeningDecisionId],
      references: [screeningDecision.id],
    }),
    startup: one(startup, {
      fields: [screeningDecisionOverride.startupId],
      references: [startup.id],
    }),
    actor: one(user, {
      fields: [screeningDecisionOverride.actorUserId],
      references: [user.id],
    }),
  }),
);

export type ScreeningDecisionOverrideRow =
  typeof screeningDecisionOverride.$inferSelect;
export type NewScreeningDecisionOverrideRow =
  typeof screeningDecisionOverride.$inferInsert;
