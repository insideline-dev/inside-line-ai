import { Injectable, Logger } from "@nestjs/common";
import { and, eq, isNotNull } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import {
  investorScoringPreference,
  stageScoringWeight,
  type ScoringWeights,
} from "../../investor/entities";
import { startup, StartupStage } from "../../startup/entities";

export interface SectionScores {
  team: number;
  market: number;
  product: number;
  traction: number;
  businessModel: number;
  gtm: number;
  financials: number;
  competitiveAdvantage: number;
  legal: number;
  dealTerms: number;
  exitPotential: number;
}

export type NormalizedWeights = SectionScores;

const DEFAULT_STAGE_WEIGHTS: Record<StartupStage, ScoringWeights> = {
  [StartupStage.PRE_SEED]: {
    team: 30,
    market: 20,
    product: 10,
    traction: 5,
    businessModel: 8,
    gtm: 5,
    financials: 2,
    competitiveAdvantage: 8,
    legal: 5,
    dealTerms: 5,
    exitPotential: 2,
  },
  [StartupStage.SEED]: {
    team: 25,
    market: 18,
    product: 12,
    traction: 10,
    businessModel: 10,
    gtm: 7,
    financials: 3,
    competitiveAdvantage: 7,
    legal: 3,
    dealTerms: 3,
    exitPotential: 2,
  },
  [StartupStage.SERIES_A]: {
    team: 20,
    market: 15,
    product: 12,
    traction: 15,
    businessModel: 12,
    gtm: 8,
    financials: 5,
    competitiveAdvantage: 6,
    legal: 2,
    dealTerms: 3,
    exitPotential: 2,
  },
  [StartupStage.SERIES_B]: {
    team: 15,
    market: 12,
    product: 10,
    traction: 18,
    businessModel: 15,
    gtm: 10,
    financials: 8,
    competitiveAdvantage: 5,
    legal: 2,
    dealTerms: 3,
    exitPotential: 2,
  },
  [StartupStage.SERIES_C]: {
    team: 12,
    market: 10,
    product: 8,
    traction: 18,
    businessModel: 15,
    gtm: 10,
    financials: 12,
    competitiveAdvantage: 5,
    legal: 3,
    dealTerms: 4,
    exitPotential: 3,
  },
  [StartupStage.SERIES_D]: {
    team: 10,
    market: 8,
    product: 7,
    traction: 18,
    businessModel: 15,
    gtm: 8,
    financials: 15,
    competitiveAdvantage: 5,
    legal: 4,
    dealTerms: 5,
    exitPotential: 5,
  },
  [StartupStage.SERIES_E]: {
    team: 8,
    market: 7,
    product: 6,
    traction: 18,
    businessModel: 15,
    gtm: 7,
    financials: 17,
    competitiveAdvantage: 5,
    legal: 5,
    dealTerms: 6,
    exitPotential: 6,
  },
  [StartupStage.SERIES_F_PLUS]: {
    team: 7,
    market: 6,
    product: 5,
    traction: 17,
    businessModel: 15,
    gtm: 6,
    financials: 18,
    competitiveAdvantage: 5,
    legal: 6,
    dealTerms: 8,
    exitPotential: 7,
  },
};

@Injectable()
export class ScoreComputationService {
  private readonly logger = new Logger(ScoreComputationService.name);

  constructor(private drizzle: DrizzleService) {}

  validateWeights(weights: SectionScores): boolean {
    const values = Object.values(weights);
    const hasInvalid = values.some(
      (value) => !Number.isFinite(value) || value < 0,
    );
    const sum = values.reduce((acc, value) => acc + value, 0);
    return !hasInvalid && sum > 0;
  }

  normalizeWeights(weights: SectionScores): NormalizedWeights {
    if (!this.validateWeights(weights)) {
      throw new Error("Invalid scoring weights");
    }

    const sum = Object.values(weights).reduce((acc, value) => acc + value, 0);
    const factor = sum;

    return {
      team: weights.team / factor,
      market: weights.market / factor,
      product: weights.product / factor,
      traction: weights.traction / factor,
      businessModel: weights.businessModel / factor,
      gtm: weights.gtm / factor,
      financials: weights.financials / factor,
      competitiveAdvantage: weights.competitiveAdvantage / factor,
      legal: weights.legal / factor,
      dealTerms: weights.dealTerms / factor,
      exitPotential: weights.exitPotential / factor,
    };
  }

  computeWeightedScore(
    sectionScores: SectionScores,
    weights: NormalizedWeights,
  ): number {
    const weighted =
      sectionScores.team * weights.team +
      sectionScores.market * weights.market +
      sectionScores.product * weights.product +
      sectionScores.traction * weights.traction +
      sectionScores.businessModel * weights.businessModel +
      sectionScores.gtm * weights.gtm +
      sectionScores.financials * weights.financials +
      sectionScores.competitiveAdvantage * weights.competitiveAdvantage +
      sectionScores.legal * weights.legal +
      sectionScores.dealTerms * weights.dealTerms +
      sectionScores.exitPotential * weights.exitPotential;

    return Number(weighted.toFixed(1));
  }

  async getWeightsForStage(stage: string): Promise<NormalizedWeights> {
    const [row] = await this.drizzle.db
      .select({ weights: stageScoringWeight.weights })
      .from(stageScoringWeight)
      .where(eq(stageScoringWeight.stage, stage as StartupStage));

    if (row?.weights && this.validateWeights(row.weights as SectionScores)) {
      return this.normalizeWeights(row.weights as SectionScores);
    }

    this.logger.warn(
      `Missing or invalid stage weights for ${stage}, using defaults`,
    );

    const fallbackStage = this.toStartupStage(stage);
    const fallback = DEFAULT_STAGE_WEIGHTS[fallbackStage];
    return this.normalizeWeights(fallback as SectionScores);
  }

  async computeWithInvestorPreferences(
    sectionScores: SectionScores,
    stage: string,
    investorId?: string,
  ): Promise<number> {
    if (investorId) {
      const [preference] = await this.drizzle.db
        .select({
          useCustomWeights: investorScoringPreference.useCustomWeights,
          customWeights: investorScoringPreference.customWeights,
        })
        .from(investorScoringPreference)
        .where(
          and(
            eq(investorScoringPreference.investorId, investorId),
            eq(investorScoringPreference.stage, stage as StartupStage),
          ),
        );

      if (
        preference?.useCustomWeights &&
        preference.customWeights &&
        this.validateWeights(preference.customWeights as SectionScores)
      ) {
        const normalized = this.normalizeWeights(
          preference.customWeights as SectionScores,
        );
        return this.computeWeightedScore(sectionScores, normalized);
      }
    }

    const stageWeights = await this.getWeightsForStage(stage);
    return this.computeWeightedScore(sectionScores, stageWeights);
  }

  async computePercentileRank(overallScore: number): Promise<number> {
    const rows = await this.drizzle.db
      .select({ overallScore: startup.overallScore })
      .from(startup)
      .where(isNotNull(startup.overallScore));

    const scores = rows
      .map((row) => row.overallScore)
      .filter((value): value is number => typeof value === "number");

    if (scores.length === 0) {
      return 100;
    }

    const atOrBelow = scores.filter((score) => score <= overallScore).length;
    return Number(((atOrBelow / scores.length) * 100).toFixed(1));
  }

  computeConfidenceScore(
    evaluation: Record<string, unknown>,
    weights: NormalizedWeights,
  ): "High" | "Medium" | "Low" {
    const CONFIDENCE_MAP: Record<string, number> = {
      high: 1.0,
      mid: 0.67,
      medium: 0.67,
      low: 0.33,
    };

    const keys: Array<keyof NormalizedWeights> = [
      "team",
      "market",
      "product",
      "traction",
      "businessModel",
      "gtm",
      "financials",
      "competitiveAdvantage",
      "legal",
      "dealTerms",
      "exitPotential",
    ];

    let weightedSum = 0;
    let totalWeight = 0;

    for (const key of keys) {
      const section = evaluation[key] as
        | { confidence?: string }
        | undefined;
      const rawConfidence = section?.confidence?.toLowerCase() ?? "low";
      const numeric = CONFIDENCE_MAP[rawConfidence] ?? 0.33;
      const weight = weights[key] ?? 0;
      weightedSum += numeric * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return "Low";
    const avg = weightedSum / totalWeight;
    if (avg >= 0.7) return "High";
    if (avg >= 0.4) return "Medium";
    return "Low";
  }

  private toStartupStage(stage: string): StartupStage {
    if (Object.values(StartupStage).includes(stage as StartupStage)) {
      return stage as StartupStage;
    }

    return StartupStage.SEED;
  }
}
