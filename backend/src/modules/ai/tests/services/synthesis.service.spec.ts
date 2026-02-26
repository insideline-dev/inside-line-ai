import { beforeEach, describe, expect, it, jest } from "bun:test";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import type { DrizzleService } from "../../../../database";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { SynthesisAgent } from "../../agents/synthesis";
import type { ScoreComputationService } from "../../services/score-computation.service";
import type { MemoGeneratorService } from "../../services/memo-generator.service";
import type { AiConfigService } from "../../services/ai-config.service";
import {
  SynthesisService,
  SYNTHESIS_AGENT_KEY,
} from "../../services/synthesis.service";
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
  let memoGenerator: jest.Mocked<MemoGeneratorService>;

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
    const defaultSelectLimit = jest.fn().mockResolvedValue([]);
    const defaultSelectWhere = jest.fn().mockReturnValue({
      limit: defaultSelectLimit,
    });
    const defaultSelectFrom = jest.fn().mockReturnValue({
      where: defaultSelectWhere,
    });
    const defaultSelect = jest.fn().mockReturnValue({
      from: defaultSelectFrom,
    });

    drizzle = {
      db: {
        select: defaultSelect,
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
          if (phase === PipelinePhase.EXTRACTION) {
            return Promise.resolve(pipeline.extraction);
          }
          if (phase === PipelinePhase.SCRAPING) {
            return Promise.resolve(pipeline.scraping);
          }
          if (phase === PipelinePhase.RESEARCH) {
            return Promise.resolve(pipeline.research);
          }
          if (phase === PipelinePhase.EVALUATION) {
            return Promise.resolve(createMockEvaluationResult());
          }
          return Promise.resolve(null);
        }),
    } as unknown as jest.Mocked<PipelineStateService>;

    synthesisAgent = {
      runDetailed: jest.fn().mockResolvedValue({
        output: createMockSynthesisResult(),
        inputPrompt: "Synthesis prompt",
        outputText: JSON.stringify(createMockSynthesisResult()),
        outputJson: createMockSynthesisResult(),
        usedFallback: false,
        attempt: 1,
        retryCount: 0,
      }),
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
      computePercentileRank: jest.fn().mockResolvedValue(75),
    } as unknown as jest.Mocked<ScoreComputationService>;

    aiConfig = {
      getModelForPurpose: jest.fn().mockReturnValue("gpt-4"),
    } as unknown as jest.Mocked<AiConfigService>;

    memoGenerator = {
      generateAndUpload: jest.fn().mockResolvedValue({
        investorMemoUrl: "https://cdn.test/memo.pdf",
        founderReportUrl: "https://cdn.test/founder.pdf",
      }),
    } as unknown as jest.Mocked<MemoGeneratorService>;

    service = new SynthesisService(
      drizzle as unknown as DrizzleService,
      pipelineState as unknown as PipelineStateService,
      synthesisAgent as unknown as SynthesisAgent,
      scoreComputation as unknown as ScoreComputationService,
      aiConfig as unknown as AiConfigService,
      memoGenerator as unknown as MemoGeneratorService,
    );
  });

  it("orchestrates synthesis, scoring, persistence, and memo generation", async () => {
    const result = await service.run("startup-1");

    expect(synthesisAgent.runDetailed).toHaveBeenCalledTimes(1);
    expect(scoreComputation.getWeightsForStage).toHaveBeenCalledWith(
      pipeline.extraction.stage,
    );
    expect(scoreComputation.computeWeightedScore).toHaveBeenCalled();
    expect(scoreComputation.computePercentileRank).toHaveBeenCalledWith(79.4);
    expect(memoGenerator.generateAndUpload).toHaveBeenCalledWith(
      "startup-1",
      expect.any(Object),
    );
    expect(drizzle.db.transaction).toHaveBeenCalledTimes(1);
    expect(result.overallScore).toBe(79.4);
    expect(result.percentileRank).toBe(75);
  });

  it("receives fallback result when synthesis agent fails", async () => {
    synthesisAgent.runDetailed.mockResolvedValueOnce({
      output: {
        overallScore: 0,
        recommendation: "Decline",
        executiveSummary: "Synthesis failed — manual review required.",
        strengths: [],
        concerns: ["Automated synthesis could not be completed"],
        investmentThesis:
          "Unable to generate investment thesis due to synthesis failure.",
        nextSteps: ["Manual review required"],
        confidenceLevel: "Low",
        investorMemo: {
          executiveSummary: "Synthesis generation failed. Please review evaluation data manually.",
          sections: [],
          recommendation: "Decline",
          riskLevel: "high",
          dealHighlights: [],
          keyDueDiligenceAreas: ["Manual review required"],
        },
        founderReport: {
          summary: "We were unable to generate an automated report. Our team will follow up.",
          sections: [],
          actionItems: ["Await manual review from the investment team"],
        },
        dataConfidenceNotes:
          "Synthesis failed — all scores require manual verification.",
      },
      inputPrompt: "Synthesis prompt",
      outputText: "fallback output",
      outputJson: { overallScore: 0 },
      usedFallback: true,
      error: "Model returned empty structured output; fallback result generated.",
      fallbackReason: "EMPTY_STRUCTURED_OUTPUT",
      rawProviderError: "No object generated",
      attempt: 1,
      retryCount: 0,
    });

    const result = await service.run("startup-1");

    expect(synthesisAgent.runDetailed).toHaveBeenCalledTimes(1);
    expect(result.recommendation).toBe("Decline");
    expect(result.executiveSummary).toContain("manual review required");
  });

  it("returns trace metadata from runDetailed", async () => {
    const result = await service.runDetailed("startup-1");

    expect(result.trace.agentKey).toBe(SYNTHESIS_AGENT_KEY);
    expect(result.trace.status).toBe("completed");
    expect(result.trace.usedFallback).toBe(false);
    expect(result.trace.inputPrompt).toBe("Synthesis prompt");
    expect(result.trace.outputText).toContain("overallScore");
  });

  it("does not fail the pipeline when memo generation fails", async () => {
    memoGenerator.generateAndUpload.mockRejectedValueOnce(
      new Error("pdf upload failed"),
    );

    const result = await service.run("startup-1");

    expect(result.overallScore).toBe(79.4);
  });

  it("throws when prerequisite phase data is missing", async () => {
    pipelineState.getPhaseResult.mockResolvedValueOnce(null as never);

    await expect(service.run("startup-1")).rejects.toThrow(
      "Synthesis requires extraction, research, and evaluation results",
    );
  });

  it("sanitizes preserved previous narrative when fallback reuses stored output", async () => {
    synthesisAgent.runDetailed.mockResolvedValueOnce({
      output: {
        overallScore: 0,
        recommendation: "Decline",
        executiveSummary: "Synthesis failed — manual review required.",
        strengths: [],
        concerns: ["Automated synthesis could not be completed"],
        investmentThesis:
          "Unable to generate investment thesis due to synthesis failure.",
        nextSteps: ["Manual review required"],
        confidenceLevel: "Low",
        investorMemo: {
          executiveSummary: "Synthesis generation failed.",
          sections: [],
          recommendation: "Decline",
          riskLevel: "high",
          dealHighlights: [],
          keyDueDiligenceAreas: ["Manual review required"],
        },
        founderReport: {
          summary: "Automated founder report unavailable.",
          sections: [],
          actionItems: ["Await manual review"],
        },
        dataConfidenceNotes: "Fallback mode.",
      },
      inputPrompt: "Synthesis prompt",
      outputText: "fallback output",
      outputJson: { overallScore: 0 },
      usedFallback: true,
      error: "Model returned empty structured output; fallback result generated.",
      fallbackReason: "EMPTY_STRUCTURED_OUTPUT",
      rawProviderError: "No object generated",
      attempt: 1,
      retryCount: 0,
    });

    (drizzle.db as unknown as {
      select: () => {
        from: () => { where: () => { limit: () => Promise<unknown[]> } };
      };
    }).select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            {
              executiveSummary:
                "Uber is currently rated 85/100 with a Pass recommendation and medium confidence. Highest-scoring dimensions are Traction and Team.",
              keyStrengths: ["Team quality (91/100, 84% confidence)"],
              keyRisks: ["Lowest-scoring dimensions are Legal and Deal Terms."],
              recommendations: ["Validate data reconciliation (70/100, medium confidence)"],
              investorMemo: {
                executiveSummary:
                  "This section is currently scored at 88/100 with 85% confidence. Investor memo body.",
                summary:
                  "Highest-scoring dimensions are Team and Product. Lowest-scoring dimensions are GTM.",
                sections: [
                  {
                    title: "Overview",
                    content:
                      "This section is currently scored at 88/100 with 85% confidence. Narrative body.",
                  },
                ],
                recommendation: "Consider",
                riskLevel: "medium",
                dealHighlights: ["Team (91/100, 84% confidence)"],
                keyDueDiligenceAreas: ["Resolve mismatch with medium confidence"],
              },
              founderReport: {
                summary:
                  "This section is currently scored at 88/100 with 85% confidence. Founder report body.",
                sections: [
                  {
                    title: "Plan",
                    content:
                      "Lowest-scoring dimensions are GTM and Legal. Improve accordingly.",
                  },
                ],
                actionItems: ["Strengthen GTM with medium confidence"],
              },
              dataConfidenceNotes:
                "Highest-scoring dimensions are Team and Product. Lowest-scoring dimensions are Legal.",
            },
          ]),
        }),
      }),
    });

    const result = await service.run("startup-1");

    expect(result.executiveSummary).not.toContain("/100");
    expect(result.executiveSummary.toLowerCase()).not.toContain("highest-scoring");
    expect(result.strengths.join(" ")).not.toContain("/100");
    expect(result.concerns.join(" ").toLowerCase()).not.toContain("lowest-scoring");
    expect(result.investorMemo.executiveSummary).not.toContain("/100");
    expect(result.investorMemo.summary ?? "").not.toContain("Highest-scoring");
    expect(result.founderReport.summary).not.toContain("/100");
    expect(result.dataConfidenceNotes.toLowerCase()).not.toContain("highest-scoring");
  });
});
