import { beforeEach, describe, expect, it, jest } from "bun:test";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import type { DrizzleService } from "../../../../database";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { PipelineStateSnapshotService } from "../../services/pipeline-state-snapshot.service";
import type { MemoSynthesisAgent, MemoSynthesisOutput } from "../../agents/synthesis/memo-synthesis.agent";
import type { ReportSynthesisAgent, ReportSynthesisOutput } from "../../agents/synthesis/report-synthesis.agent";
import type { ScoreComputationService } from "../../services/score-computation.service";
import type { MemoGeneratorService } from "../../services/memo-generator.service";
import type { AiConfigService } from "../../services/ai-config.service";
import { SynthesisService } from "../../services/synthesis.service";
import { MEMO_SYNTHESIS_AGENT_KEY, REPORT_SYNTHESIS_AGENT_KEY } from "../../constants/agent-keys";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";
import { createMockEvaluationResult } from "../fixtures/mock-evaluation.fixture";
import { createMockSynthesisResult } from "../fixtures/mock-synthesis.fixture";

// ---------------------------------------------------------------------------
// Helpers to build per-agent mock outputs from the shared fixture
// ---------------------------------------------------------------------------

function makeMemoOutput(): MemoSynthesisOutput {
  const mock = createMockSynthesisResult();
  return {
    executiveSummary: mock.investorMemo.executiveSummary,
    sections: [],
    keyDueDiligenceAreas: mock.investorMemo.keyDueDiligenceAreas ?? [],
    dataConfidenceNotes: "Full evaluation coverage completed without fallback",
  };
}

function makeReportOutput(): ReportSynthesisOutput {
  const mock = createMockSynthesisResult();
  return {
    dealSnapshot: mock.dealSnapshot,
    keyStrengths: mock.keyStrengths,
    keyRisks: mock.keyRisks,
    exitScenarios: mock.exitScenarios,
    founderReport: mock.founderReport,
    dataConfidenceNotes: "Full evaluation coverage completed without fallback",
  };
}

function makeMemoRunResult(overrides?: Partial<ReturnType<MemoSynthesisAgent["runDetailed"]> extends Promise<infer T> ? T : never>) {
  return {
    output: makeMemoOutput(),
    inputPrompt: "Memo synthesis prompt",
    systemPrompt: "Memo system prompt",
    outputText: JSON.stringify(makeMemoOutput()),
    outputJson: makeMemoOutput(),
    usedFallback: false,
    attempt: 1,
    retryCount: 0,
    ...overrides,
  };
}

function makeReportRunResult(overrides?: Partial<ReturnType<ReportSynthesisAgent["runDetailed"]> extends Promise<infer T> ? T : never>) {
  return {
    output: makeReportOutput(),
    inputPrompt: "Report synthesis prompt",
    systemPrompt: "Report system prompt",
    outputText: JSON.stringify(makeReportOutput()),
    outputJson: makeReportOutput(),
    usedFallback: false,
    attempt: 1,
    retryCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("SynthesisService", () => {
  let service: SynthesisService;
  let drizzle: jest.Mocked<DrizzleService>;
  let pipelineState: jest.Mocked<PipelineStateService>;
  let pipelineStateSnapshots: jest.Mocked<PipelineStateSnapshotService>;
  let memoSynthesisAgent: jest.Mocked<MemoSynthesisAgent>;
  let reportSynthesisAgent: jest.Mocked<ReportSynthesisAgent>;
  let scoreComputation: jest.Mocked<ScoreComputationService>;
  let aiConfig: jest.Mocked<AiConfigService>;
  let memoGenerator: jest.Mocked<MemoGeneratorService>;

  const pipeline = createEvaluationPipelineInput();

  // Shared drizzle select chain — individual tests can override with mockResolvedValueOnce
  let defaultSelectLimit: jest.Mock;

  beforeEach(() => {
    // ── Transaction / update mocks ──────────────────────────────────────────
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

    // ── Select chain — returns [] by default (no stored eval row / no memo) ─
    defaultSelectLimit = jest.fn().mockResolvedValue([]);
    const defaultSelectWhere = jest.fn().mockReturnValue({ limit: defaultSelectLimit });
    const defaultSelectFrom = jest.fn().mockReturnValue({ where: defaultSelectWhere });
    const defaultSelect = jest.fn().mockReturnValue({ from: defaultSelectFrom });

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

    // ── Pipeline state — all phases present by default ──────────────────────
    pipelineState = {
      getPhaseResult: jest
        .fn()
        .mockImplementation((_startupId: string, phase: PipelinePhase) => {
          if (phase === PipelinePhase.EXTRACTION) return Promise.resolve(pipeline.extraction);
          if (phase === PipelinePhase.SCRAPING) return Promise.resolve(pipeline.scraping);
          if (phase === PipelinePhase.RESEARCH) return Promise.resolve(pipeline.research);
          if (phase === PipelinePhase.SCREENING) return Promise.resolve(pipeline.screening);
          if (phase === PipelinePhase.EVALUATION) return Promise.resolve(createMockEvaluationResult());
          return Promise.resolve(null);
        }),
    } as unknown as jest.Mocked<PipelineStateService>;

    // ── Snapshot service — returns null by default (no snapshot) ────────────
    pipelineStateSnapshots = {
      getLatestReusableSnapshot: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<PipelineStateSnapshotService>;

    // ── Synthesis agents ─────────────────────────────────────────────────────
    memoSynthesisAgent = {
      runDetailed: jest.fn().mockResolvedValue(makeMemoRunResult()),
    } as unknown as jest.Mocked<MemoSynthesisAgent>;

    reportSynthesisAgent = {
      runDetailed: jest.fn().mockResolvedValue(makeReportRunResult()),
    } as unknown as jest.Mocked<ReportSynthesisAgent>;

    // ── Supporting services ──────────────────────────────────────────────────
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
      computeConfidenceScore: jest.fn().mockReturnValue("Medium"),
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
      pipelineStateSnapshots as unknown as PipelineStateSnapshotService,
      memoSynthesisAgent as unknown as MemoSynthesisAgent,
      reportSynthesisAgent as unknown as ReportSynthesisAgent,
      scoreComputation as unknown as ScoreComputationService,
      aiConfig as unknown as AiConfigService,
      memoGenerator as unknown as MemoGeneratorService,
    );
  });

  // ── Test 1: Happy-path orchestration ──────────────────────────────────────

  it("orchestrates synthesis: both agents called, score computed, memo generated", async () => {
    const result = await service.run("startup-1");

    expect(memoSynthesisAgent.runDetailed).toHaveBeenCalledTimes(1);
    expect(reportSynthesisAgent.runDetailed).toHaveBeenCalledTimes(1);
    expect(scoreComputation.getWeightsForStage).toHaveBeenCalledWith(
      pipeline.extraction.stage,
    );
    expect(scoreComputation.computeWeightedScore).toHaveBeenCalled();
    expect(memoGenerator.generateAndUpload).toHaveBeenCalledWith("startup-1");
    expect(drizzle.db.transaction).toHaveBeenCalledTimes(1);
    expect(result.overallScore).toBe(79.4);
  });

  // ── Test 2: Fallback agent output reflected in result ─────────────────────

  it("reflects fallback output when report agent returns usedFallback: true", async () => {
    const fallbackReport: ReportSynthesisOutput = {
      dealSnapshot: "Synthesis failed — manual review required.",
      keyStrengths: [],
      keyRisks: ["Automated synthesis could not be completed"],
      exitScenarios: [],
      founderReport: {
        summary: "Automated founder report unavailable.",
        whatsWorking: [],
        pathToInevitability: ["Await manual review"],
      },
      dataConfidenceNotes: "Fallback mode.",
    };

    reportSynthesisAgent.runDetailed.mockResolvedValueOnce(
      makeReportRunResult({
        output: fallbackReport,
        usedFallback: true,
        error: "Model returned empty structured output; fallback result generated.",
        fallbackReason: "EMPTY_STRUCTURED_OUTPUT",
        rawProviderError: "No object generated",
      }),
    );

    const result = await service.run("startup-1");

    expect(reportSynthesisAgent.runDetailed).toHaveBeenCalledTimes(1);
    expect(result.dealSnapshot).toContain("manual review required");
    expect(result.keyRisks).toContain("Automated synthesis could not be completed");
  });

  // ── Test 3: runDetailed returns traces array ───────────────────────────────

  it("returns traces array with memo and report traces from runDetailed", async () => {
    const result = await service.runDetailed("startup-1");

    expect(result.traces).toHaveLength(2);

    const memoTrace = result.traces[0];
    expect(memoTrace).toBeDefined();
    expect(memoTrace!.agentKey).toBe(MEMO_SYNTHESIS_AGENT_KEY);
    expect(memoTrace!.status).toBe("completed");
    expect(memoTrace!.usedFallback).toBe(false);
    expect(memoTrace!.inputPrompt).toBe("Memo synthesis prompt");
    expect(memoTrace!.systemPrompt).toBe("Memo system prompt");

    const reportTrace = result.traces[1];
    expect(reportTrace).toBeDefined();
    expect(reportTrace!.agentKey).toBe(REPORT_SYNTHESIS_AGENT_KEY);
    expect(reportTrace!.status).toBe("completed");
    expect(reportTrace!.usedFallback).toBe(false);
    expect(reportTrace!.inputPrompt).toBe("Report synthesis prompt");
    expect(reportTrace!.systemPrompt).toBe("Report system prompt");
  });

  // ── Test 4: Research payload forwarded to both agents ─────────────────────

  it("passes text-based research payloads through to both agents", async () => {
    pipelineState.getPhaseResult.mockImplementation(
      (_startupId: string, phase: PipelinePhase) => {
        if (phase === PipelinePhase.EXTRACTION) return Promise.resolve(pipeline.extraction);
        if (phase === PipelinePhase.SCRAPING) return Promise.resolve(pipeline.scraping);
        if (phase === PipelinePhase.SCREENING) return Promise.resolve(pipeline.screening);
        if (phase === PipelinePhase.RESEARCH)
          return Promise.resolve({
            ...pipeline.research,
            team: "Updated team report text",
            combinedReportText: "## Team Research Report\nUpdated team report text",
          });
        if (phase === PipelinePhase.EVALUATION)
          return Promise.resolve(createMockEvaluationResult());
        return Promise.resolve(null);
      },
    );

    await service.run("startup-1");

    const memoInput = memoSynthesisAgent.runDetailed.mock.calls[0]?.[0];
    expect(memoInput?.research.team).toBe("Updated team report text");
    expect(memoInput?.research.combinedReportText).toContain("Updated team report text");

    const reportInput = reportSynthesisAgent.runDetailed.mock.calls[0]?.[0];
    expect(reportInput?.research.team).toBe("Updated team report text");
  });

  // ── Test 5: Memo generation failure does not fail the pipeline ─────────────

  it("does not fail the pipeline when memo generation fails", async () => {
    memoGenerator.generateAndUpload.mockRejectedValueOnce(
      new Error("pdf upload failed"),
    );

    const result = await service.run("startup-1");

    expect(result.overallScore).toBe(79.4);
  });

  // ── Test 6: Unrecoverable missing inputs throw with clear message ──────────

  it("throws with message containing 'missing required input(s)' and 'evaluation' when inputs are unrecoverable", async () => {
    // Return null for evaluation from pipeline state
    pipelineState.getPhaseResult.mockImplementation(
      (_startupId: string, phase: PipelinePhase) => {
        if (phase === PipelinePhase.EXTRACTION) return Promise.resolve(pipeline.extraction);
        if (phase === PipelinePhase.SCRAPING) return Promise.resolve(pipeline.scraping);
        if (phase === PipelinePhase.RESEARCH) return Promise.resolve(pipeline.research);
        if (phase === PipelinePhase.SCREENING) return Promise.resolve(pipeline.screening);
        return Promise.resolve(null); // evaluation missing
      },
    );

    // Snapshot also unavailable
    pipelineStateSnapshots.getLatestReusableSnapshot.mockResolvedValue(null);

    // DB returns empty — no stored evaluation row
    defaultSelectLimit.mockResolvedValue([]);

    await expect(service.run("startup-1")).rejects.toThrow(/missing required input/i);
    await expect(service.run("startup-1")).rejects.toThrow(/evaluation/i);
  });

  // ── Test 7: Recovers evaluation result from DB ────────────────────────────

  it("recovers evaluation from DB when pipeline state is missing it", async () => {
    // evaluation missing from pipeline state
    pipelineState.getPhaseResult.mockImplementation(
      (_startupId: string, phase: PipelinePhase) => {
        if (phase === PipelinePhase.EXTRACTION) return Promise.resolve(pipeline.extraction);
        if (phase === PipelinePhase.SCRAPING) return Promise.resolve(pipeline.scraping);
        if (phase === PipelinePhase.RESEARCH) return Promise.resolve(pipeline.research);
        if (phase === PipelinePhase.SCREENING) return Promise.resolve(pipeline.screening);
        return Promise.resolve(null); // evaluation missing
      },
    );

    const evalMock = createMockEvaluationResult();

    // DB returns a row with all 11 section data columns, each with a numeric score
    const dbRow = {
      teamData: evalMock.team,
      marketData: evalMock.market,
      productData: evalMock.product,
      tractionData: evalMock.traction,
      businessModelData: evalMock.businessModel,
      gtmData: evalMock.gtm,
      financialsData: evalMock.financials,
      competitiveAdvantageData: evalMock.competitiveAdvantage,
      legalData: evalMock.legal,
      dealTermsData: evalMock.dealTerms,
      exitPotentialData: evalMock.exitPotential,
    };

    defaultSelectLimit.mockResolvedValue([dbRow]);

    const result = await service.run("startup-1");

    expect(memoSynthesisAgent.runDetailed).toHaveBeenCalledTimes(1);
    expect(reportSynthesisAgent.runDetailed).toHaveBeenCalledTimes(1);
    expect(result.overallScore).toBe(79.4);
  });

  // ── Test 8: Recovers upstream (extraction/scraping) from snapshot ──────────

  it("recovers extraction and scraping from snapshot when pipeline state is missing them", async () => {
    // extraction and scraping missing from pipeline state
    pipelineState.getPhaseResult.mockImplementation(
      (_startupId: string, phase: PipelinePhase) => {
        if (phase === PipelinePhase.RESEARCH) return Promise.resolve(pipeline.research);
        if (phase === PipelinePhase.SCREENING) return Promise.resolve(pipeline.screening);
        if (phase === PipelinePhase.EVALUATION) return Promise.resolve(createMockEvaluationResult());
        return Promise.resolve(null); // extraction + scraping missing
      },
    );

    // Snapshot holds the missing upstream results
    pipelineStateSnapshots.getLatestReusableSnapshot.mockResolvedValue({
      results: {
        [PipelinePhase.EXTRACTION]: pipeline.extraction,
        [PipelinePhase.SCRAPING]: pipeline.scraping,
        [PipelinePhase.SCREENING]: pipeline.screening,
        [PipelinePhase.RESEARCH]: pipeline.research,
      },
    });

    const result = await service.run("startup-1");

    expect(memoSynthesisAgent.runDetailed).toHaveBeenCalledTimes(1);
    expect(reportSynthesisAgent.runDetailed).toHaveBeenCalledTimes(1);
    expect(result.overallScore).toBe(79.4);
  });
});
