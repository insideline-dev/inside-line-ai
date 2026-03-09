import { pgTable, varchar, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "../../../auth/entities";

export const aiModelOverride = pgTable("ai_model_overrides", {
  purpose: varchar("purpose", { length: 50 }).primaryKey(),
  modelName: varchar("model_name", { length: 100 }).notNull(),
  searchMode: varchar("search_mode", { length: 50 }),
  updatedBy: uuid("updated_by").references(() => user.id),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export type AiModelOverride = typeof aiModelOverride.$inferSelect;
export type NewAiModelOverride = typeof aiModelOverride.$inferInsert;
