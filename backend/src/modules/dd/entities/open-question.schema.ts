// DS-E10-F3-S1 — DD Open Questions ledger (mutable, per-deal).

import {
  pgTable,
  text,
  uuid,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "../../../auth/entities/auth.schema";
import { startup } from "../../startup/entities/startup.schema";

export const OPEN_QUESTION_STATUSES = ["open", "resolved", "dismissed"] as const;
export type OpenQuestionStatus = (typeof OPEN_QUESTION_STATUSES)[number];

export const OPEN_QUESTION_SEED_SOURCES = ["screening_seed", "manual"] as const;
export type OpenQuestionSeedSource = (typeof OPEN_QUESTION_SEED_SOURCES)[number];

export const OPEN_QUESTION_SCREENING_SOURCES = [
  "screening-output",
  "triage-decision",
] as const;
export type OpenQuestionScreeningSource =
  (typeof OPEN_QUESTION_SCREENING_SOURCES)[number];

export const ddOpenQuestion = pgTable(
  "dd_open_question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startupId: uuid("startup_id")
      .notNull()
      .references(() => startup.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    summary: text("summary").notNull(),
    seedSource: text("seed_source")
      .notNull()
      .$type<OpenQuestionSeedSource>()
      .default("screening_seed"),
    screeningSource: text("screening_source").$type<
      OpenQuestionScreeningSource | null
    >(),
    status: text("status")
      .notNull()
      .$type<OpenQuestionStatus>()
      .default("open"),
    ownerUserId: uuid("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("dd_open_question_startup_key_idx").on(
      table.startupId,
      table.key,
    ),
    index("dd_open_question_startup_status_idx").on(
      table.startupId,
      table.status,
    ),
  ],
);

export const ddOpenQuestionRelations = relations(ddOpenQuestion, ({ one }) => ({
  startup: one(startup, {
    fields: [ddOpenQuestion.startupId],
    references: [startup.id],
  }),
  owner: one(user, {
    fields: [ddOpenQuestion.ownerUserId],
    references: [user.id],
  }),
}));

export type DdOpenQuestionRow = typeof ddOpenQuestion.$inferSelect;
export type NewDdOpenQuestion = typeof ddOpenQuestion.$inferInsert;
