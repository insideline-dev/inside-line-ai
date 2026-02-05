import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { user } from '../../../auth/entities/auth.schema';
import { startup } from '../../startup/entities/startup.schema';

// ============================================================================
// INVESTOR NOTES TABLE
// ============================================================================

export const investorNote = pgTable(
  'investor_note',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    startupId: uuid('startup_id')
      .notNull()
      .references(() => startup.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    category: text('category'),
    isPinned: boolean('is_pinned').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('investor_note_investor_idx').on(table.investorId),
    index('investor_note_startup_idx').on(table.startupId),
    index('investor_note_investor_startup_idx').on(
      table.investorId,
      table.startupId,
    ),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const investorNoteRelations = relations(investorNote, ({ one }) => ({
  investor: one(user, {
    fields: [investorNote.investorId],
    references: [user.id],
  }),
  startup: one(startup, {
    fields: [investorNote.startupId],
    references: [startup.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type InvestorNote = typeof investorNote.$inferSelect;
export type NewInvestorNote = typeof investorNote.$inferInsert;
