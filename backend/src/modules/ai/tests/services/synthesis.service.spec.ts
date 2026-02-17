import { beforeEach, describe, expect, it, jest } from "bun:test";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import type { DrizzleService } from "../../../../database";
import type { NotificationService } from "../../../../notification/notification.service";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { SynthesisAgent } from "../../agents/synthesis";
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
  let synthesisAgent: jest.Mocked<SynthesisAgent>;
  let scoreComputation: jest.Mocked<ScoreComputationService>;
  let aiConfig: jest.Mocked<AiConfigService>;
  let investorMatching: jest.Mocked<InvestorMatchingService>;
  let memoGenerator: jest.Mocked<MemoGeneratorService>;
  let notifications: jest.Mocked<NotificationService>;

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
      run: jest.fn().mockResolvedValue(createMockSynthesisResult()),
    } as unknown as jest.Mocked<SynthesisAgent>;

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

    aiConfig = {
      getModelForPurpose: jest.fn().mockReturnValue("gpt-4"),
    } as unknown as jest.Mocked<AiConfigService>;

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

    service = new SynthesisService(
      drizzle as unknown as DrizzleService,
      pipelineState as unknown as PipelineStateService,
      synthesisAgent as unknown as SynthesisAgent,
      scoreComputation as unknown as ScoreComputationService,
      aiConfig as unknown as AiConfigService,
      investorMatching as unknown as InvestorMatchingService,
      memoGenerator as unknown as MemoGeneratorService,
      notifications as unknown as NotificationService,
    );
  });

  it("orchestrates synthesis, scoring, persistence, matching, memo generation, and notifications", async () => {
    const result = await service.run("startup-1");

    expect(synthesisAgent.run).toHaveBeenCalledTimes(1);
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

  it("receives fallback result when synthesis agent fails", async () => {
    synthesisAgent.run.mockResolvedValueOnce({
      overallScore: 0,
      recommendation: "Decline",
      executiveSummary: "Synthesis failed — manual review required.",
      strengths: [],
      concerns: ["Automated synthesis could not be completed"],
      investmentThesis: "Unable to generate investment thesis due to synthesis failure.",
      nextSteps: ["Manual review required"],
      confidenceLevel: "Low",
      investorMemo: "Synthesis generation failed. Please review evaluation data manually.",
      founderReport: "We were unable to generate an automated report. Our team will follow up.",
      dataConfidenceNotes: "Synthesis failed — all scores require manual verification.",
    });

    const result = await service.run("startup-1");

    expect(synthesisAgent.run).toHaveBeenCalledTimes(1);
    expect(result.recommendation).toBe("Decline");
    expect(result.executiveSummary).toContain("manual review required");
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

  describe("post-synthesis operations isolation", () => {
    it("memo generation failure does not fail the synthesis", async () => {
      memoGenerator.generateAndUpload.mockRejectedValueOnce(
        new Error("S3 upload timeout"),
      );

      const result = await service.run("startup-1");

      expect(result.overallScore).toBe(79.4);
      expect(synthesisAgent.run).toHaveBeenCalledTimes(1);
      expect(drizzle.db.transaction).toHaveBeenCalledTimes(1);
      expect(result.investorMemoUrl).toBeUndefined();
    });

    it("investor matching failure does not fail the synthesis", async () => {
      investorMatching.matchStartup.mockRejectedValueOnce(
        new Error("Database connection lost"),
      );

      const result = await service.run("startup-1");

      expect(result.overallScore).toBe(79.4);
      expect(drizzle.db.transaction).toHaveBeenCalledTimes(1);
      expect(notifications.createBulk).not.toHaveBeenCalled();
    });

    it("post-synthesis operations are isolated from each other", async () => {
      investorMatching.matchStartup.mockRejectedValueOnce(
        new Error("Matching service down"),
      );
      memoGenerator.generateAndUpload.mockResolvedValueOnce({
        investorMemoUrl: "https://cdn.test/memo-working.pdf",
        founderReportUrl: "https://cdn.test/founder-working.pdf",
      });

      const result = await service.run("startup-1");

      expect(result.overallScore).toBe(79.4);
      expect(result.investorMemoUrl).toBe("https://cdn.test/memo-working.pdf");
      expect(result.founderReportUrl).toBe("https://cdn.test/founder-working.pdf");
      expect(notifications.createBulk).not.toHaveBeenCalled();
    });

    it("both post-synthesis operations fail independently without cascade", async () => {
      investorMatching.matchStartup.mockRejectedValueOnce(
        new Error("Matching failed"),
      );
      memoGenerator.generateAndUpload.mockRejectedValueOnce(
        new Error("Memo generation failed"),
      );

      const result = await service.run("startup-1");

      expect(result.overallScore).toBe(79.4);
      expect(drizzle.db.transaction).toHaveBeenCalledTimes(1);
      expect(result.investorMemoUrl).toBeUndefined();
      expect(result.founderReportUrl).toBeUndefined();
    });

    it("notification creation failure after successful matching does not fail synthesis", async () => {
      notifications.createBulk.mockRejectedValueOnce(
        new Error("Notification service unavailable"),
      );

      const result = await service.run("startup-1");

      expect(result.overallScore).toBe(79.4);
      expect(investorMatching.matchStartup).toHaveBeenCalledTimes(1);
      expect(drizzle.db.transaction).toHaveBeenCalledTimes(1);
    });

    it("does not send notifications when no investor matches found", async () => {
      investorMatching.matchStartup.mockResolvedValueOnce({
        candidatesEvaluated: 5,
        matches: [],
      });

      const result = await service.run("startup-1");

      expect(result.overallScore).toBe(79.4);
      expect(notifications.createBulk).not.toHaveBeenCalled();
    });
  });
});
