import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../database';
import { userProfile } from './entities/user-profile.schema';
import type { UpdateUserProfileDetails } from './dto/update-profile.dto';

export type DbUserProfile = typeof userProfile.$inferSelect;

@Injectable()
export class ProfileService {
  constructor(private drizzle: DrizzleService) {}

  /**
   * Get or create profile for user
   * Creates a profile if one doesn't exist
   */
  async getProfile(userId: string): Promise<DbUserProfile> {
    const [existing] = await this.drizzle.db
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .limit(1);

    if (existing) {
      return existing;
    }

    // Create profile if it doesn't exist
    const [created] = await this.drizzle.db
      .insert(userProfile)
      .values({ userId })
      .returning();

    if (!created) {
      throw new Error('Failed to create user profile');
    }

    return created;
  }

  /**
   * Update profile fields
   */
  async updateProfile(
    userId: string,
    data: UpdateUserProfileDetails,
  ): Promise<DbUserProfile> {
    // Ensure profile exists first
    await this.getProfile(userId);

    const [updated] = await this.drizzle.db
      .update(userProfile)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(userProfile.userId, userId))
      .returning();

    if (!updated) {
      throw new Error('Failed to update user profile');
    }

    return updated;
  }
}
