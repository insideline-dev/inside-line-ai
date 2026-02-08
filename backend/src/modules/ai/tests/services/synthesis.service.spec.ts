import { beforeEach, describe, expect, it, jest } from "bun:test";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import type { DrizzleService } from "../../../../database";
import type { NotificationService } from "../../../../notification/notification.service";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { SynthesisAgentService } from "../../services/synthesis-agent.service";
import type { ScoreComputationService } from "../../services/score-computation.service";
import type { InvestorMatchingService } from "../../services/investor-matching.service";
import type { MemoGeneratorService } from "../../services/memo-generator.service";
import type { AiConfigService } from "../../services/ai-config.service";
import { SynthesisService } from "../../services/synthesis.service";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";
import { createMockEvaluationResult } from "../fixtures/mock-evaluation.fixture";
import { createMockSynthesisResult } from "../fixtures/mock-synthesis.fixture";

describe("SynthesisService", () => {
  let service: SynthesisService;
  let drizzle: jest.Mocked<DrizzleService>;
  let pipelineState: jest.Mocked<PipelineStateService>;
  let synthesisAgent: jest.Mocked<SynthesisAgentService>;
  let scoreComputation: jest.Mocked<ScoreComputationService>;
  let investorMatching: jest.Mocked<InvestorMatchingService>;
  let memoGenerator: jest.Mocked<MemoGeneratorService>;
  let notifications: jest.Mocked<NotificationService>;
  let aiConfig: jest.Mocked<AiConfigService>;

  const pipeline = createEvaluationPipelineInput();

  beforeEach(() => {
    const insertValues = jest.fn().mockReturnValue({
      onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
    });
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const tx = {
      insert: jest.fn().mockReturnValue({ values: insertValues }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({ where: updateWhere }),
      }),
    };

    drizzle = {
      db: {
        transaction: jest.fn().mockImplementation(
          async (cb: (txDb: typeof tx) => Promise<void>) => {
            await cb(tx);
          },
        ),
      },
    } as unknown as jest.Mocked<DrizzleService>;

    pipelineState = {
      getPhaseResult: jest
        .fn()
        .mockImplementation((_startupId: string, phase: PipelinePhase) => {
          if (phase === PipelinePhase.EXTRACTION) return Promise.resolve(pipeline.extraction);
          if (phase === PipelinePhase.SCRAPING) return Promise.resolve(pipeline.scraping);
          if (phase === PipelinePhase.RESEARCH) return Promise.resolve(pipeline.research);
          if (phase === PipelinePhase.EVALUATION) return Promise.resolve(createMockEvaluationResult());
          return Promise.resolve(null);
        }),
    } as unknown as jest.Mocked<PipelineStateService>;

    synthesisAgent = {
      generate: jest.fn().mockResolvedValue(createMockSynthesisResult()),
    } as unknown as jest.Mocked<SynthesisAgentService>;

    scoreComputation = {
      getWeightsForStage: jest.fn().mockResolvedValue({
        team: 0.25,
        market: 0.18,
        product: 0.12,
        traction: 0.1,
        businessModel: 0.1,
        gtm: 0.07,
        financials: 0.03,
        competitiveAdvantage: 0.07,
        legal: 0.03,
        dealTerms: 0.03,
        exitPotential: 0.02,
      }),
      computeWeightedScore: jest.fn().mockReturnValue(79.4),
      computePercentileRank: jest.fn().mockResolvedValue(88),
    } as unknown as jest.Mocked<ScoreComputationService>;

    investorMatching = {
      matchStartup: jest.fn().mockResolvedValue({
        candidatesEvaluated: 2,
        matches: [
          {
            investorId: "investor-1",
            thesisFitScore: 87,
            fitRationale: "Strong fit",
          },
        ],
      }),
    } as unknown as jest.Mocked<InvestorMatchingService>;

    memoGenerator = {
      generateAndUpload: jest.fn().mockResolvedValue({
        investorMemoUrl: "https://cdn.test/memo.pdf",
        founderReportUrl: "https://cdn.test/founder.pdf",
      }),
    } as unknown as jest.Mocked<MemoGeneratorService>;

    notifications = {
      createBulk: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<NotificationService>;

    aiConfig = {
      getMaxRetries: jest.fn().mockReturnValue(3),
    } as unknown as jest.Mocked<AiConfigService>;

    service = new SynthesisService(
      drizzle as unknown as DrizzleService,
      pipelineState as unknown as PipelineStateService,
      synthesisAgent as unknown as SynthesisAgentService,
      scoreComputation as unknown as ScoreComputationService,
      investorMatching as unknown as InvestorMatchingService,
      memoGenerator as unknown as MemoGeneratorService,
      notifications as unknown as NotificationService,
      aiConfig as unknown as AiConfigService,
    );
  });

  it("orchestrates synthesis, scoring, persistence, matching, memo generation, and notifications", async () => {
    const result = await service.run("startup-1");

    expect(synthesisAgent.generate).toHaveBeenCalledTimes(1);
    expect(scoreComputation.getWeightsForStage).toHaveBeenCalledWith(pipeline.extraction.stage);
    expect(scoreComputation.computeWeightedScore).toHaveBeenCalled();
    expect(scoreComputation.computePercentileRank).toHaveBeenCalledWith(79.4);
    expect(investorMatching.matchStartup).toHaveBeenCalledWith(
      expect.objectContaining({ startupId: "startup-1" }),
    );
    expect(memoGenerator.generateAndUpload).toHaveBeenCalledWith(
      "startup-1",
      expect.any(Object),
    );
    expect(notifications.createBulk).toHaveBeenCalledTimes(1);
    expect(drizzle.db.transaction).toHaveBeenCalledTimes(1);
    expect(result.overallScore).toBe(79.4);
  });

  it("retries synthesis generation up to 2 retries before succeeding", async () => {
    synthesisAgent.generate
      .mockRejectedValueOnce(new Error("schema validation failed"))
      .mockResolvedValueOnce(createMockSynthesisResult());

    const result = await service.run("startup-1");

    expect(synthesisAgent.generate).toHaveBeenCalledTimes(2);
    expect(result.recommendation).toBe("Consider");
  });

  it("does not fail the pipeline when memo generation fails", async () => {
    memoGenerator.generateAndUpload.mockRejectedValueOnce(new Error("pdf upload failed"));

    const result = await service.run("startup-1");

    expect(result.overallScore).toBe(79.4);
    expect(notifications.createBulk).toHaveBeenCalledTimes(1);
  });

  it("throws when prerequisite phase data is missing", async () => {
    pipelineState.getPhaseResult.mockResolvedValueOnce(null as never);

    await expect(service.run("startup-1")).rejects.toThrow(
      "Synthesis requires extraction, research, and evaluation results",
    );
  });
});
