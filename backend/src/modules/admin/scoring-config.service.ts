import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import {
  stageScoringWeight,
  type ScoringWeights,
} from '../investor/entities/investor.schema';
import { StartupStage } from '../startup/entities/startup.schema';
import type { UpdateStageWeights } from './dto';

const STAGES = Object.values(StartupStage);

const DEFAULT_STAGE_WEIGHTS: Record<StartupStage, ScoringWeights> = {
  [StartupStage.PRE_SEED]: { team: 30, market: 20, product: 10, traction: 5, businessModel: 8, gtm: 5, financials: 2, competitiveAdvantage: 8, legal: 5, dealTerms: 5, exitPotential: 2 },
  [StartupStage.SEED]: { team: 25, market: 18, product: 12, traction: 10, businessModel: 10, gtm: 7, financials: 3, competitiveAdvantage: 7, legal: 3, dealTerms: 3, exitPotential: 2 },
  [StartupStage.SERIES_A]: { team: 20, market: 15, product: 12, traction: 15, businessModel: 12, gtm: 8, financials: 5, competitiveAdvantage: 6, legal: 2, dealTerms: 3, exitPotential: 2 },
  [StartupStage.SERIES_B]: { team: 15, market: 12, product: 10, traction: 18, businessModel: 15, gtm: 10, financials: 8, competitiveAdvantage: 5, legal: 2, dealTerms: 3, exitPotential: 2 },
  [StartupStage.SERIES_C]: { team: 12, market: 10, product: 8, traction: 18, businessModel: 15, gtm: 10, financials: 12, competitiveAdvantage: 5, legal: 3, dealTerms: 4, exitPotential: 3 },
  [StartupStage.SERIES_D]: { team: 10, market: 8, product: 7, traction: 18, businessModel: 15, gtm: 8, financials: 15, competitiveAdvantage: 5, legal: 4, dealTerms: 5, exitPotential: 5 },
  [StartupStage.SERIES_E]: { team: 8, market: 7, product: 6, traction: 18, businessModel: 15, gtm: 7, financials: 17, competitiveAdvantage: 5, legal: 5, dealTerms: 6, exitPotential: 6 },
  [StartupStage.SERIES_F_PLUS]: { team: 7, market: 6, product: 5, traction: 17, businessModel: 15, gtm: 6, financials: 18, competitiveAdvantage: 5, legal: 6, dealTerms: 8, exitPotential: 7 },
};

const EMPTY_RATIONALE = {
  team: '', market: '', product: '', traction: '', businessModel: '',
  gtm: '', financials: '', competitiveAdvantage: '', legal: '', dealTerms: '', exitPotential: '',
};

@Injectable()
export class ScoringConfigService {
  private readonly logger = new Logger(ScoringConfigService.name);

  constructor(private drizzle: DrizzleService) {}

  async getAll() {
    return this.drizzle.db
      .select()
      .from(stageScoringWeight)
      .orderBy(stageScoringWeight.stage);
  }

  async getByStage(stage: string) {
    const [row] = await this.drizzle.db
      .select()
      .from(stageScoringWeight)
      .where(eq(stageScoringWeight.stage, stage as StartupStage));

    if (!row) {
      throw new NotFoundException(`No scoring weights found for stage: ${stage}`);
    }

    return row;
  }

  async updateByStage(stage: string, data: UpdateStageWeights, userId: string) {
    const [updated] = await this.drizzle.db
      .update(stageScoringWeight)
      .set({
        weights: data.weights,
        rationale: data.rationale,
        overallRationale: data.overallRationale ?? null,
        lastModifiedBy: userId,
      })
      .where(eq(stageScoringWeight.stage, stage as StartupStage))
      .returning();

    if (!updated) {
      throw new NotFoundException(`No scoring weights found for stage: ${stage}`);
    }

    this.logger.log(`Updated scoring weights for stage: ${stage}`);
    return updated;
  }

  async seed(userId: string) {
    const existing = await this.drizzle.db
      .select({ stage: stageScoringWeight.stage })
      .from(stageScoringWeight);

    const existingStages = new Set(existing.map((r) => r.stage));
    const toInsert = STAGES.filter((s) => !existingStages.has(s));

    if (toInsert.length === 0) {
      this.logger.log('All stage weights already exist, skipping seed');
      return { inserted: 0 };
    }

    await this.drizzle.db.insert(stageScoringWeight).values(
      toInsert.map((stage) => ({
        stage,
        weights: DEFAULT_STAGE_WEIGHTS[stage],
        rationale: EMPTY_RATIONALE,
        overallRationale: '',
        lastModifiedBy: userId,
      })),
    );

    this.logger.log(`Seeded ${toInsert.length} stage scoring weights`);
    return { inserted: toInsert.length };
  }
}
