import { pgTable, text, timestamp, jsonb, uuid, index } from 'drizzle-orm/pg-core';
import { user } from '../../../../auth/entities/auth.schema';

// ============================================================================
// LINKEDIN PROFILE CACHE TABLE
// ============================================================================

/**
 * LinkedIn profile cache
 *
 * Stores fetched LinkedIn profiles with 7-day TTL to reduce API calls
 *
 * RLS: Admin access or user who created the cache entry
 */
export const linkedinProfileCache = pgTable(
  'linkedin_profile_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // LinkedIn identifiers
    linkedinUrl: text('linkedin_url').notNull().unique(),
    linkedinIdentifier: text('linkedin_identifier').notNull(), // e.g., "john-doe-123"

    // Profile data
    profileData: jsonb('profile_data').$type<LinkedInProfile>().notNull(),

    // Cache metadata
    fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(), // 7 days from fetch

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('linkedin_cache_url_expires_idx').on(table.linkedinUrl, table.expiresAt),
    index('linkedin_cache_user_id_idx').on(table.userId),
  ],
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export interface LinkedInProfile {
  id: string;
  firstName: string;
  lastName: string;
  headline: string;
  location: string;
  profileUrl: string;
  profileImageUrl: string | null;
  summary: string | null;
  currentCompany: {
    name: string;
    title: string;
  } | null;
  experience: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate: string | null;
    current: boolean;
  }>;
  education: Array<{
    school: string;
    degree: string;
    fieldOfStudy: string;
    startYear: number;
    endYear: number | null;
  }>;
}

export type LinkedInProfileCache = typeof linkedinProfileCache.$inferSelect;
export type NewLinkedInProfileCache = typeof linkedinProfileCache.$inferInsert;
