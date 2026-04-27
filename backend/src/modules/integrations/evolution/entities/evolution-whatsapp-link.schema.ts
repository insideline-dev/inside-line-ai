import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "../../../../auth/entities/auth.schema";
import { startup } from "../../../startup/entities/startup.schema";

export const evolutionWhatsappLink = pgTable(
  "evolution_whatsapp_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
    startupId: uuid("startup_id").references(() => startup.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("evolution_whatsapp_links_phone_idx").on(table.phone),
    index("evolution_whatsapp_links_email_idx").on(table.email),
    index("evolution_whatsapp_links_user_id_idx").on(table.userId),
    index("evolution_whatsapp_links_startup_id_idx").on(table.startupId),
  ],
);
