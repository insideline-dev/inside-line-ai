import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "../../../auth/entities/auth.schema";

export const earlyAccessInviteStatusEnum = pgEnum("early_access_invite_status", [
  "pending",
  "redeemed",
  "revoked",
  "expired",
]);

export const earlyAccessInvite = pgTable(
  "early_access_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    status: earlyAccessInviteStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    redeemedAt: timestamp("redeemed_at"),
    redeemedByUserId: uuid("redeemed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("early_access_invites_email_idx").on(table.email),
    index("early_access_invites_status_idx").on(table.status),
  ],
);

export const waitlistEntry = pgTable(
  "waitlist_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    companyName: text("company_name").notNull(),
    role: text("role").notNull(),
    website: text("website").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("waitlist_entries_created_idx").on(table.createdAt)],
);

export type EarlyAccessInvite = typeof earlyAccessInvite.$inferSelect;
export type NewEarlyAccessInvite = typeof earlyAccessInvite.$inferInsert;
export type WaitlistEntry = typeof waitlistEntry.$inferSelect;
export type NewWaitlistEntry = typeof waitlistEntry.$inferInsert;
