import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import {
  investorScoringPreference,
  stageScoringWeight,
  ScoringWeights,
} from './entities/investor.schema';
import { StartupStage } from '../startup/entities/startup.schema';
import { UpdateScoringPreferences } from './dto';

@Injectable()
export class ScoringPreferencesService {
  private readonly logger = new Logger(ScoringPreferencesService.name);

  constructor(private drizzle: DrizzleService) {}

  async getAll(userId: string) {
    return this.drizzle.withRLS(userId, async (db) => {
      return db
        .select()
        .from(investorScoringPreference)
        .where(eq(investorScoringPreference.investorId, userId));
    });
  }

  async getByStage(userId: string, stage: StartupStage) {
    return this.drizzle.withRLS(userId, async (db) => {
      const [pref] = await db
        .select()
        .from(investorScoringPreference)
        .where(
          and(
            eq(investorScoringPreference.investorId, userId),
            eq(investorScoringPreference.stage, stage),
          ),
        )
        .limit(1);

      return pref ?? null;
    });
  }

  async getEffectiveWeights(
    userId: string,
    stage: StartupStage,
  ): Promise<ScoringWeights> {
    return this.drizzle.withRLS(userId, async (db) => {
      const [pref] = await db
        .select()
        .from(investorScoringPreference)
        .where(
          and(
            eq(investorScoringPreference.investorId, userId),
            eq(investorScoringPreference.stage, stage),
          ),
        )
        .limit(1);

      if (pref?.useCustomWeights && pref.customWeights) {
        return pref.customWeights;
      }

      // Fall back to admin stage defaults
      const [stageDefault] = await db
        .select()
        .from(stageScoringWeight)
        .where(eq(stageScoringWeight.stage, stage))
        .limit(1);

      if (!stageDefault) {
        throw new NotFoundException(
          `No default weights configured for stage ${stage}`,
        );
      }

      return stageDefault.weights;
    });
  }

  async upsert(userId: string, stage: StartupStage, dto: UpdateScoringPreferences) {
    return this.drizzle.withRLS(userId, async (db) => {
      const existing = await this.getByStage(userId, stage);

      if (existing) {
        const [updated] = await db
          .update(investorScoringPreference)
          .set({
            useCustomWeights: dto.useCustomWeights,
            customWeights: dto.customWeights ?? null,
            customRationale: dto.customRationale ?? null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(investorScoringPreference.investorId, userId),
              eq(investorScoringPreference.stage, stage),
            ),
          )
          .returning();

        this.logger.log(`Updated scoring preference for ${userId} stage ${stage}`);
        return updated;
      }

      const [created] = await db
        .insert(investorScoringPreference)
        .values({
          investorId: userId,
          stage,
          useCustomWeights: dto.useCustomWeights,
          customWeights: dto.customWeights ?? null,
          customRationale: dto.customRationale ?? null,
        })
        .returning();

      this.logger.log(`Created scoring preference for ${userId} stage ${stage}`);
      return created;
    });
  }

  async reset(userId: string, stage: StartupStage) {
    return this.drizzle.withRLS(userId, async (db) => {
      const existing = await this.getByStage(userId, stage);

      if (!existing) {
        throw new NotFoundException(
          `No scoring preference found for stage ${stage}`,
        );
      }

      await db
        .delete(investorScoringPreference)
        .where(
          and(
            eq(investorScoringPreference.investorId, userId),
            eq(investorScoringPreference.stage, stage),
          ),
        );

      this.logger.log(`Reset scoring preference for ${userId} stage ${stage}`);
    });
  }

  async resetAll(userId: string) {
    return this.drizzle.withRLS(userId, async (db) => {
      await db
        .delete(investorScoringPreference)
        .where(eq(investorScoringPreference.investorId, userId));

      this.logger.log(`Reset all scoring preferences for ${userId}`);
    });
  }
}
