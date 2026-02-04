import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { scoringWeight, ScoringWeight } from './entities/investor.schema';
import { UpdateScoringWeights } from './dto';

const DEFAULT_WEIGHTS = {
  marketWeight: 20,
  teamWeight: 20,
  productWeight: 20,
  tractionWeight: 20,
  financialsWeight: 20,
};

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(private drizzle: DrizzleService) {}

  async findOne(userId: string): Promise<ScoringWeight> {
    return this.drizzle.withRLS(userId, async (db) => {
      const [weights] = await db
        .select()
        .from(scoringWeight)
        .where(eq(scoringWeight.userId, userId))
        .limit(1);

      if (!weights) {
        return {
          id: '',
          userId,
          ...DEFAULT_WEIGHTS,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      return weights;
    });
  }

  async update(userId: string, dto: UpdateScoringWeights) {
    return this.drizzle.withRLS(userId, async (db) => {
      const [existing] = await db
        .select()
        .from(scoringWeight)
        .where(eq(scoringWeight.userId, userId))
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(scoringWeight)
          .set({
            ...dto,
            updatedAt: new Date(),
          })
          .where(eq(scoringWeight.userId, userId))
          .returning();

        this.logger.log(`Updated scoring weights for user ${userId}`);
        return updated;
      }

      const [created] = await db
        .insert(scoringWeight)
        .values({
          userId,
          ...dto,
        })
        .returning();

      this.logger.log(`Created scoring weights for user ${userId}`);
      return created;
    });
  }

  getDefaults() {
    return DEFAULT_WEIGHTS;
  }
}
