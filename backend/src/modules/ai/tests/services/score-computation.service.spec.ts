import { beforeEach, describe, expect, it, jest } from "bun:test";
import { StartupStage } from "../../../startup/entities";
import { stageScoringWeight } from "../../../investor/entities";
import type { DrizzleService } from "../../../../database";
import { ScoreComputationService } from "../../services/score-computation.service";

describe("ScoreComputationService", () => {
  let service: ScoreComputationService;
  let drizzle: jest.Mocked<DrizzleService>;

  beforeEach(() => {
    drizzle = {
      db: {
        select: jest.fn(),
      },
    } as unknown as jest.Mocked<DrizzleService>;

    service = new ScoreComputationService(drizzle as unknown as DrizzleService);
  });

  it("normalizes percentage weights to 1.0", () => {
    const normalized = service.normalizeWeights({
      team: 25,
      market: 15,
      product: 12,
      traction: 10,
      businessModel: 10,
      gtm: 7,
      financials: 3,
      competitiveAdvantage: 7,
      legal: 3,
      dealTerms: 3,
      exitPotential: 5,
    });

    const sum = Object.values(normalized).reduce((acc, value) => acc + value, 0);
    expect(Number(sum.toFixed(6))).toBe(1);
  });

  it("computes weighted score deterministically", () => {
    const score = service.computeWeightedScore(
      {
        team: 80,
        market: 70,
        product: 90,
        traction: 60,
        businessModel: 75,
        gtm: 68,
        financials: 65,
        competitiveAdvantage: 72,
        legal: 78,
        dealTerms: 73,
        exitPotential: 74,
      },
      {
        team: 0.25,
        market: 0.15,
        product: 0.12,
        traction: 0.1,
        businessModel: 0.1,
        gtm: 0.07,
        financials: 0.03,
        competitiveAdvantage: 0.07,
        legal: 0.03,
        dealTerms: 0.03,
        exitPotential: 0.05,
      },
    );

    expect(score).toBe(74.8);
  });

  it("returns stage weights from DB when available", async () => {
    const where = jest.fn().mockResolvedValue([
      {
        stage: StartupStage.SEED,
        weights: {
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
      },
    ]);

    const from = jest.fn().mockReturnValue({ where });
    (drizzle.db.select as jest.Mock).mockReturnValue({ from });

    const weights = await service.getWeightsForStage(StartupStage.SEED);

    expect(drizzle.db.select).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith(stageScoringWeight);
    expect(weights.team).toBeCloseTo(0.25, 5);
    expect(weights.market).toBeCloseTo(0.18, 5);
  });

  it("falls back to built-in defaults when stage row is missing", async () => {
    const where = jest.fn().mockResolvedValue([]);
    const from = jest.fn().mockReturnValue({ where });
    (drizzle.db.select as jest.Mock).mockReturnValue({ from });

    const weights = await service.getWeightsForStage(StartupStage.PRE_SEED);

    expect(weights.team).toBeGreaterThan(weights.financials);
  });

  it("computes percentile rank against existing startup scores", async () => {
    const where = jest.fn().mockResolvedValue([
      { overallScore: 45 },
      { overallScore: 60 },
      { overallScore: 72 },
      { overallScore: 88 },
      { overallScore: 91 },
    ]);

    const from = jest.fn().mockReturnValue({ where });
    (drizzle.db.select as jest.Mock).mockReturnValue({ from });

    const percentile = await service.computePercentileRank(72);

    expect(percentile).toBe(60);
  });
});
