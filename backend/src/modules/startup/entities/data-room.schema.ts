import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { startup } from './startup.schema';
import { asset } from '../../../storage/entities/asset.schema';

// ============================================================================
// DATA ROOM TABLE
// ============================================================================

export const dataRoom = pgTable(
  'data_rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    startupId: uuid('startup_id')
      .notNull()
      .references(() => startup.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => asset.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    visibleToInvestors: jsonb('visible_to_investors')
      .$type<string[]>()
      .default([]),
    uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  },
  (table) => [
    index('data_room_startup_idx').on(table.startupId),
    index('data_room_category_idx').on(table.category),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const dataRoomRelations = relations(dataRoom, ({ one }) => ({
  startup: one(startup, {
    fields: [dataRoom.startupId],
    references: [startup.id],
  }),
  asset: one(asset, {
    fields: [dataRoom.assetId],
    references: [asset.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type DataRoom = typeof dataRoom.$inferSelect;
export type NewDataRoom = typeof dataRoom.$inferInsert;
