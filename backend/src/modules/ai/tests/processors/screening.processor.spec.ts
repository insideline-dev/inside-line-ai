import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConfigService } from "@nestjs/config";
import { ScreeningProcessor } from "../../processors/screening.processor";
import type { LensRegistryService } from "../../lenses/lens-registry.service";
import type { DrizzleService } from "../../../../database";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { PipelineService } from "../../services/pipeline.service";
import type { NotificationGateway } from "../../../../notification/notification.gateway";
import type { ScreeningOutputService } from "../../contracts/screening-output";
import type { ScreeningTriageService } from "../../screening/triage";
import type { InvestorMatchingService } from "../../services/investor-matching.service";
import type { DealEventService } from "../../../startup/deal-event.service";

const STARTUP_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

function buildScreeningResult() {
  return {
    key: "team",
    output: {
      score: 82,
      signal: "advance" as const,
      rationale: "Strong team execution.",
      evidence: [
        {
          claim: "Founders have relevant operating experience.",
          source: "https://example.com/team",
          confidence: "high" as const,
        },
      ],
    },
    modelId: "gpt-5.4",
    promptKey: "team-lens",
    // DS-E2-F1-S2 — every LensRunResult carries the version pair that
    // produced it. Hard-coded to "1" here since the registry stub returns
    // a single fixture; multi-version routing is covered by the lens
    // registry spec.
    lensVersion: "1",
    promptVersion: "1",
    latencyMs: 1200,
    usedFallback: false,
    error: undefined,
  };
}

describe("ScreeningProcessor", () => {
  let processor: ScreeningProcessor;
  let config: jest.Mocked<ConfigService>;
  let lensRegistry: jest.Mocked<LensRegistryService>;
  let drizzle: jest.Mocked<DrizzleService>;
  let screeningOutput: jest.Mocked<ScreeningOutputService>;
  let screeningTriage: jest.Mocked<ScreeningTriageService>;
  let investorMatching: jest.Mocked<InvestorMatchingService>;
  let dealEvents: jest.Mocked<DealEventService>;
  let pipelineState: jest.Mocked<PipelineStateService>;
  let persistedThesisFitScore: number | null;
  let hasActiveInvestorThesis: boolean;

  beforeEach(() => {
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === "REDIS_URL") return "redis://localhost:6379";
        return fallback;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    lensRegistry = {
      keys: jest.fn().mockReturnValue(["team"]),
      runAll: jest.fn().mockResolvedValue({ team: buildScreeningResult() }),
    } as unknown as jest.Mocked<LensRegistryService>;

    const startupRow = {
      id: STARTUP_ID,
      name: "Test Startup",
      description: "A test startup",
      productDescription: null,
      industry: "SaaS",
      sectorIndustry: null,
      stage: "seed",
    };

    persistedThesisFitScore = null;
    hasActiveInvestorThesis = false;

    const select = jest.fn().mockImplementation((projection?: Record<string, unknown>) => {
      if (projection && "score" in projection) {
        const limit = jest.fn().mockResolvedValue(
          persistedThesisFitScore === null ? [] : [{ score: persistedThesisFitScore }],
        );
        const orderBy = jest.fn().mockReturnValue({ limit });
        const where = jest.fn().mockReturnValue({ orderBy, limit });
        const from = jest.fn().mockReturnValue({ where });
        return { from };
      }

      if (projection && "userId" in projection) {
        const limit = jest.fn().mockResolvedValue(
          hasActiveInvestorThesis ? [{ userId: "investor-1" }] : [],
        );
        const where = jest.fn().mockReturnValue({ limit });
        const leftJoin = jest.fn().mockReturnValue({ where });
        const from = jest.fn().mockReturnValue({ leftJoin });
        return { from };
      }

      if (projection && "location" in projection) {
        const limit = jest.fn().mockResolvedValue([
          {
            industry: startupRow.industry,
            sectorIndustryGroup: null,
            stage: startupRow.stage,
            fundingTarget: 100000,
            location: "United States",
            geoPath: ["us", "ca"],
          },
        ]);
        const where = jest.fn().mockReturnValue({ limit });
        const from = jest.fn().mockReturnValue({ where });
        return { from };
      }

      const limit = jest.fn().mockResolvedValue([startupRow]);
      const where = jest.fn().mockReturnValue({ limit });
      const from = jest.fn().mockReturnValue({ where });
      return { from };
    });

    const insert = jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });

    drizzle = {
      db: { select, insert },
    } as unknown as jest.Mocked<DrizzleService>;

    const synthesisResult = {
      dealSnapshot: "B2B SaaS startup",
      keyStrengths: ["Strong team"],
      keyRisks: ["Crowded market"],
      exitScenarios: [],
      sectionScores: {
        team: 82,
        market: 75,
        product: 70,
        traction: 68,
        businessModel: 65,
        gtm: 64,
        financials: 60,
        competitiveAdvantage: 66,
        legal: 80,
        dealTerms: 72,
        exitPotential: 63,
      },
      overallScore: 70,
      investorMemo: { title: "memo" } as never,
      founderReport: { title: "report" } as never,
      dataConfidenceNotes: "high",
    };

    pipelineState = {
      getPhaseResult: jest.fn().mockResolvedValue(synthesisResult),
    } as unknown as jest.Mocked<PipelineStateService>;

    investorMatching = {
      matchStartup: jest.fn().mockImplementation(async () => {
        persistedThesisFitScore = 27;
        return {
          candidatesEvaluated: 2,
          failedCandidates: 0,
          matches: [],
        };
      }),
    } as unknown as jest.Mocked<InvestorMatchingService>;

    screeningOutput = {
      buildForStartup: jest.fn().mockResolvedValue({
        version: 1,
        startupId: STARTUP_ID,
        pipelineRunId: RUN_ID,
        generatedAt: "2026-05-06T00:00:00.000Z",
        overall: {
          score: 77,
          signal: "review" as const,
          nextAction: "request_materials" as const,
          missingMaterials: ["deck"],
        },
        lenses: [
          {
            key: "team",
            score: 82,
            signal: "advance" as const,
            rationale: "Strong team execution.",
            evidence: [],
            modelId: "gpt-5.4",
            promptKey: "team-lens",
            latencyMs: 1200,
            usedFallback: false,
          },
        ],
      }),
    } as unknown as jest.Mocked<ScreeningOutputService>;

    screeningTriage = {
      decide: jest.fn().mockRejectedValue(new Error("triage failed")),
    } as unknown as jest.Mocked<ScreeningTriageService>;

    dealEvents = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DealEventService>;

    processor = new ScreeningProcessor(
      config,
      lensRegistry,
      drizzle,
      pipelineState,
      {} as unknown as PipelineService,
      {} as unknown as NotificationGateway,
      screeningOutput,
      screeningTriage,
      dealEvents,
      investorMatching,
    );
  });

  it("falls back to the screening output contract when triage fails", async () => {
    const result = await processor.runScreening(STARTUP_ID, RUN_ID);

    expect(result.classification).toBe("review");
    expect(result.nextAction).toBe("request_materials");
    expect(result.overallScore).toBe(77);
    expect(result.reasonCodes).toEqual([]);
    expect(result.missingMaterials).toEqual(["deck"]);
    expect(screeningOutput.buildForStartup).toHaveBeenCalledWith(STARTUP_ID, RUN_ID);
    expect(screeningTriage.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: STARTUP_ID,
        pipelineRunId: RUN_ID,
        thesisFitScore: null,
      }),
    );
    expect(investorMatching.matchStartup).not.toHaveBeenCalled();
    expect(dealEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: STARTUP_ID,
        type: "screening.completed",
      }),
    );
  });

  it("persists lens_version + prompt_version on the lens row and lensVersions on the decision (DS-E2-F1-S2)", async () => {
    // Re-mock triage so the persisted-lensVersions path is exercised — the
    // default beforeEach rejects to drive the contract-fallback branch.
    const decideMock = jest.fn().mockResolvedValue({
      classification: "advance" as const,
      nextAction: "advance" as const,
      overallScore: 82,
      reasonCodes: [],
      policyVersion: 3,
    });
    screeningTriage.decide = decideMock;

    const insertValuesMock = jest.fn().mockResolvedValue(undefined);
    const insertMock = jest.fn().mockReturnValue({ values: insertValuesMock });
    drizzle.db = {
      ...drizzle.db,
      insert: insertMock,
    } as unknown as typeof drizzle.db;

    await processor.runScreening(STARTUP_ID, RUN_ID);

    // Lens row carries lens_version + prompt_version.
    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock.mock.calls[0][0]).toMatchObject({
      lensKey: "team",
      lensVersion: "1",
      promptVersion: "1",
    });

    // Triage receives the aggregated lensVersions map for the
    // screening_decision row.
    expect(decideMock).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: STARTUP_ID,
        lensVersions: { team: "1" },
      }),
    );
  });

  it("seeds thesis-fit from investor matching when no match rows exist yet", async () => {
    hasActiveInvestorThesis = true;

    const result = await processor.runScreening(STARTUP_ID, RUN_ID);

    expect(investorMatching.matchStartup).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: STARTUP_ID,
        startup: expect.objectContaining({
          industry: "SaaS",
          stage: "seed",
          fundingTarget: 100000,
          location: "United States",
        }),
      }),
    );
    expect(screeningTriage.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: STARTUP_ID,
        pipelineRunId: RUN_ID,
        thesisFitScore: 27,
      }),
    );
    expect(result.classification).toBe("review");
    expect(result.nextAction).toBe("request_materials");
    expect(dealEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: STARTUP_ID,
        type: "screening.completed",
      }),
    );
  });
});
