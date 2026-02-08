import { relations } from 'drizzle-orm';
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { user } from '../../../auth/entities/auth.schema';
import { startup } from './startup.schema';

// ============================================================================
// ENUMS
// ============================================================================

export enum MeetingStatus {
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export const meetingStatusEnum = pgEnum('meeting_status', [
  MeetingStatus.SCHEDULED,
  MeetingStatus.COMPLETED,
  MeetingStatus.CANCELLED,
]);

// ============================================================================
// MEETING TABLE
// ============================================================================

export const meeting = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    startupId: uuid('startup_id')
      .notNull()
      .references(() => startup.id, { onDelete: 'cascade' }),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    scheduledAt: timestamp('scheduled_at').notNull(),
    duration: integer('duration').notNull().default(30),
    location: text('location'),
    notes: text('notes'),
    status: meetingStatusEnum('status')
      .default(MeetingStatus.SCHEDULED)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('meeting_startup_idx').on(table.startupId),
    index('meeting_investor_idx').on(table.investorId),
    index('meeting_status_idx').on(table.status),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const meetingRelations = relations(meeting, ({ one }) => ({
  startup: one(startup, {
    fields: [meeting.startupId],
    references: [startup.id],
  }),
  investor: one(user, {
    fields: [meeting.investorId],
    references: [user.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Meeting = typeof meeting.$inferSelect;
export type NewMeeting = typeof meeting.$inferInsert;
