import { Injectable, Logger } from '@nestjs/common';
import { eq, and, lt, gt } from 'drizzle-orm';
import { DrizzleService } from '../../../database';
import {
  linkedinProfileCache,
  type LinkedInProfile,
  type NewLinkedInProfileCache,
} from './entities';

@Injectable()
export class LinkedInCacheService {
  private readonly logger = new Logger(LinkedInCacheService.name);
  private readonly CACHE_TTL_DAYS = 7;

  constructor(private drizzle: DrizzleService) {}

  /**
   * Get cached profile if not expired
   */
  async getCached(linkedinUrl: string): Promise<LinkedInProfile | null> {
    const now = new Date();
    const [cached] = await this.drizzle.db
      .select()
      .from(linkedinProfileCache)
      .where(
        and(
          eq(linkedinProfileCache.linkedinUrl, linkedinUrl),
          // Only return if not expired (expiresAt > now)
          gt(linkedinProfileCache.expiresAt, now),
        ),
      )
      .limit(1);

    if (cached) {
      this.logger.log(`Cache hit for LinkedIn URL: ${linkedinUrl}`);
      return cached.profileData;
    }

    this.logger.log(`Cache miss for LinkedIn URL: ${linkedinUrl}`);
    return null;
  }

  /**
   * Store profile in cache with 7-day TTL
   */
  async setCache(
    userId: string,
    linkedinUrl: string,
    identifier: string,
    data: LinkedInProfile,
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const newCache: NewLinkedInProfileCache = {
      userId,
      linkedinUrl,
      linkedinIdentifier: identifier,
      profileData: data,
      fetchedAt: now,
      expiresAt,
    };

    // Upsert: insert or update if URL already exists
    await this.drizzle.db
      .insert(linkedinProfileCache)
      .values(newCache)
      .onConflictDoUpdate({
        target: linkedinProfileCache.linkedinUrl,
        set: {
          profileData: data,
          fetchedAt: now,
          expiresAt,
          linkedinIdentifier: identifier,
        },
      });

    this.logger.log(`Cached LinkedIn profile: ${linkedinUrl} (expires: ${expiresAt.toISOString()})`);
  }

  /**
   * Clear expired entries
   * @returns Number of entries cleared
   */
  async clearExpired(): Promise<number> {
    const result = await this.drizzle.db
      .delete(linkedinProfileCache)
      .where(lt(linkedinProfileCache.expiresAt, new Date()))
      .returning({ id: linkedinProfileCache.id });

    const count = result.length;
    if (count > 0) {
      this.logger.log(`Cleared ${count} expired LinkedIn cache entries`);
    }
    return count;
  }
}
