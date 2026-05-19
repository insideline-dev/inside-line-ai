// DS-E4-F3-S1 — append-only history of investor dealbreaker rule sets.

import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "../../../auth/entities/auth.schema";

export const investorDealbreakerRuleVersion = pgTable(
  "investor_dealbreaker_rule_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    investorUserId: uuid("investor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    rules: text("rules").array().notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("investor_dealbreaker_version_user_num_idx").on(
      table.investorUserId,
      table.versionNumber,
    ),
    index("investor_dealbreaker_version_user_created_idx").on(
      table.investorUserId,
      table.createdAt.desc(),
    ),
  ],
);

export const investorDealbreakerRuleVersionRelations = relations(
  investorDealbreakerRuleVersion,
  ({ one }) => ({
    investor: one(user, {
      fields: [investorDealbreakerRuleVersion.investorUserId],
      references: [user.id],
    }),
    creator: one(user, {
      fields: [investorDealbreakerRuleVersion.createdBy],
      references: [user.id],
    }),
  }),
);

export type InvestorDealbreakerRuleVersionRow =
  typeof investorDealbreakerRuleVersion.$inferSelect;
