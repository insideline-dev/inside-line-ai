import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from '../../auth/entities/auth.schema';

export const asset = pgTable(
  'asset',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id'), // nullable for orphan assets

    // Storage info
    key: text('key').notNull().unique(), // S3/R2 key
    url: text('url').notNull(), // Public URL

    // Metadata
    type: text('type').notNull(), // audio, image, video, transcript
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(), // bytes

    // Source info
    provider: text('provider'), // fal, openai, elevenlabs, etc.
    jobId: text('job_id'), // Reference to the job that created this

    // Extra metadata (provider-specific)
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('asset_user_idx').on(table.userId),
    index('asset_project_idx').on(table.projectId),
    index('asset_type_idx').on(table.type),
  ],
);

export type Asset = typeof asset.$inferSelect;
export type NewAsset = typeof asset.$inferInsert;
