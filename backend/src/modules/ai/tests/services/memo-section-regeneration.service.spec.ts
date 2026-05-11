import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConflictException, NotFoundException } from "@nestjs/common";

import type { DrizzleService } from "../../../../database";
import type {
  MemoSectionRegenerationResult,
  MemoSynthesisAgent,
} from "../../agents/synthesis/memo-synthesis.agent";
import {
  MemoSectionRegenerationService,
  type PersistedInvestorMemo,
} from "../../services/memo-section-regeneration.service";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { ScoreComputationService } from "../../services/score-computation.service";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";
import { createMockEvaluationResult } from "../fixtures/mock-evaluation.fixture";

const STARTUP_ID = "11111111-1111-1111-1111-111111111111";

const TEAM_NARRATIVE = "Team narrative refreshed.";
const MARKET_NARRATIVE = "Market narrative is unchanged — operator edit.";

function buildExistingMemo(): PersistedInvestorMemo {
  return {
    executiveSummary: "Existing executive summary that operators should keep.",
    sections: [
      {
        title: "Team",
        content: "Original team narrative (will be overwritten).",
        highlights: ["Original team highlight"],
        concerns: [],
        sources: [{ label: "deck", url: "deck://" }],
      },
      {
        title: "Market Opportunity",
        content: MARKET_NARRATIVE,
        highlights: ["Operator-curated market highlight"],
        concerns: ["Operator-curated market concern"],
        sources: [{ label: "https://research.test", url: "https://research.test" }],
      },
      {
        title: "Product and Technology",
        content: "Original product narrative.",
        highlights: [],
        concerns: [],
        sources: [],
      },
    ],
    keyDueDiligenceAreas: ["Existing DDA the UI should keep."],
  };
}

function buildAgentResult(
  overrides: Partial<MemoSectionRegenerationResult["section"]> = {},
): MemoSectionRegenerationResult {
  return {
    section: {
      sectionKey: "team",
      title: "Team",
      memoNarrative: TEAM_NARRATIVE,
      highlights: ["Founder-market fit signals"],
      concerns: ["Limited team depth outside founders"],
      diligenceItems: ["Backfill technical lead pipeline"],
      sources: [
        { label: "Pitch deck", url: "deck://" },
        { label: "Founder LinkedIn", url: "https://linkedin.com/in/example" },
      ],
      ...overrides,
    },
    inputPrompt: "regenerate prompt",
    systemPrompt: "regenerate system prompt",
    outputText: "regenerated output text",
    outputJson: { sectionKey: "team" },
    usedFallback: false,
    attempt: 1,
    retryCount: 0,
  };
}

describe("MemoSectionRegenerationService", () => {
  let service: MemoSectionRegenerationService;
  let drizzle: jest.Mocked<DrizzleService>;
  let pipelineState: jest.Mocked<PipelineStateService>;
  let memoAgent: jest.Mocked<MemoSynthesisAgent>;
  let scoreComputation: jest.Mocked<ScoreComputationService>;
  let updateCalls: Array<Record<string, unknown>>;
  let existingMemo: PersistedInvestorMemo;
  let pipeline = createEvaluationPipelineInput();

  beforeEach(() => {
    pipeline = createEvaluationPipelineInput();
    existingMemo = buildExistingMemo();
    updateCalls = [];

    const selectLimit = jest.fn(() =>
      Promise.resolve([{ investorMemo: existingMemo }]),
    );
    const selectWhere = jest.fn(() => ({ limit: selectLimit }));
    const selectFrom = jest.fn(() => ({ where: selectWhere }));
    const selectFn = jest.fn(() => ({ from: selectFrom }));

    const updateWhere = jest.fn(() => Promise.resolve(undefined));
    const updateSet = jest.fn((values: Record<string, unknown>) => {
      updateCalls.push(values);
      return { where: updateWhere };
    });
    const updateFn = jest.fn(() => ({ set: updateSet }));

    drizzle = {
      db: {
        select: selectFn,
        update: updateFn,
      },
    } as unknown as jest.Mocked<DrizzleService>;

    pipelineState = {
      getPhaseResult: jest.fn((_startupId: string, phase: PipelinePhase) => {
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

    memoAgent = {
      regenerateSection: jest.fn().mockResolvedValue(buildAgentResult()),
    } as unknown as jest.Mocked<MemoSynthesisAgent>;

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
    } as unknown as jest.Mocked<ScoreComputationService>;

    service = new MemoSectionRegenerationService(
      drizzle as unknown as DrizzleService,
      pipelineState as unknown as PipelineStateService,
      memoAgent as unknown as MemoSynthesisAgent,
      scoreComputation as unknown as ScoreComputationService,
    );
  });

  it("regenerates one section without touching the others", async () => {
    const result = await service.regenerate(STARTUP_ID, "team");

    expect(memoAgent.regenerateSection).toHaveBeenCalledTimes(1);
    expect(memoAgent.regenerateSection.mock.calls[0]?.[0]).toBe("team");

    expect(result.sectionKey).toBe("team");
    expect(result.section.content).toBe(TEAM_NARRATIVE);
    expect(result.section.sectionKey).toBe("team");
    expect(result.regeneratedAt).toBeTruthy();
    expect(result.usedFallback).toBe(false);

    expect(updateCalls).toHaveLength(1);
    const persistedMemo = updateCalls[0]?.investorMemo as PersistedInvestorMemo;

    // Executive summary + DDAs survive.
    expect(persistedMemo.executiveSummary).toBe(
      "Existing executive summary that operators should keep.",
    );
    expect(persistedMemo.keyDueDiligenceAreas).toEqual([
      "Existing DDA the UI should keep.",
    ]);

    // Other sections untouched.
    const market = persistedMemo.sections?.find(
      (s) => s.title === "Market Opportunity",
    );
    expect(market?.content).toBe(MARKET_NARRATIVE);
    expect(market?.highlights).toEqual(["Operator-curated market highlight"]);
    expect(market?.concerns).toEqual(["Operator-curated market concern"]);

    // Targeted section overwritten + carries metadata.
    const team = persistedMemo.sections?.find((s) => s.title === "Team");
    expect(team?.content).toBe(TEAM_NARRATIVE);
    expect(team?.sectionKey).toBe("team");
    expect(team?.regeneratedAt).toBeTruthy();
  });

  it("preserves evidence linkage by stripping sources with empty urls", async () => {
    memoAgent.regenerateSection.mockResolvedValueOnce(
      buildAgentResult({
        sources: [
          { label: "Good source", url: "https://valid.test" },
          { label: "Bad", url: "" },
          { label: "Whitespace", url: "   " },
          { label: "Deck", url: "deck://" },
        ],
      }),
    );

    const result = await service.regenerate(STARTUP_ID, "team");

    const urls = (result.section.sources ?? []).map((s) => s.url);
    expect(urls).toEqual(["https://valid.test", "deck://"]);

    const persistedMemo = updateCalls[0]?.investorMemo as PersistedInvestorMemo;
    const persistedSources = persistedMemo.sections?.find(
      (s) => s.title === "Team",
    )?.sources;
    expect(persistedSources?.map((s) => s.url)).toEqual([
      "https://valid.test",
      "deck://",
    ]);
  });

  it("throws NotFoundException for an unknown section key", async () => {
    await expect(
      service.regenerate(STARTUP_ID, "not-a-section" as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(memoAgent.regenerateSection).not.toHaveBeenCalled();
  });

  it("blocks concurrent regenerations for the same (startup, section)", async () => {
    let resolveAgent: (value: MemoSectionRegenerationResult) => void = () => {};
    memoAgent.regenerateSection.mockReturnValueOnce(
      new Promise<MemoSectionRegenerationResult>((resolve) => {
        resolveAgent = resolve;
      }),
    );

    const first = service.regenerate(STARTUP_ID, "team");
    expect(service.isInFlight(STARTUP_ID, "team")).toBe(true);

    await expect(service.regenerate(STARTUP_ID, "team")).rejects.toBeInstanceOf(
      ConflictException,
    );

    resolveAgent(buildAgentResult());
    await first;

    expect(service.isInFlight(STARTUP_ID, "team")).toBe(false);
  });

  it("lets different sections run in parallel for the same startup", async () => {
    let resolveTeam: (value: MemoSectionRegenerationResult) => void = () => {};
    memoAgent.regenerateSection.mockReturnValueOnce(
      new Promise<MemoSectionRegenerationResult>((resolve) => {
        resolveTeam = resolve;
      }),
    );
    memoAgent.regenerateSection.mockReturnValueOnce(
      Promise.resolve(buildAgentResult({ sectionKey: "market", title: "Market Opportunity" })),
    );

    const teamPromise = service.regenerate(STARTUP_ID, "team");
    const marketPromise = service.regenerate(STARTUP_ID, "market");

    // Market should complete even though team is still in flight.
    await expect(marketPromise).resolves.toMatchObject({ sectionKey: "market" });

    resolveTeam(buildAgentResult());
    await teamPromise;
  });

  it("flags overwroteOperatorEdits when the section was previously regenerated", async () => {
    existingMemo.sections = existingMemo.sections?.map((s) =>
      s.title === "Team"
        ? {
            ...s,
            sectionKey: "team",
            regeneratedAt: "2026-05-01T00:00:00.000Z",
          }
        : s,
    );

    const result = await service.regenerate(STARTUP_ID, "team");
    expect(result.overwroteOperatorEdits).toBe(true);
  });

  it("propagates fallback flag from the agent without throwing", async () => {
    memoAgent.regenerateSection.mockResolvedValueOnce({
      ...buildAgentResult(),
      usedFallback: true,
      error: "model unavailable",
    });

    const result = await service.regenerate(STARTUP_ID, "team");
    expect(result.usedFallback).toBe(true);
    expect(updateCalls).toHaveLength(1);
  });

  it("throws NotFoundException when prerequisite phase results are missing", async () => {
    pipelineState.getPhaseResult.mockImplementation(() => Promise.resolve(null));
    await expect(service.regenerate(STARTUP_ID, "team")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("throws NotFoundException when the startup evaluation row is missing", async () => {
    drizzle.db.select = jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve([])),
        })),
      })),
    })) as unknown as DrizzleService["db"]["select"];

    await expect(service.regenerate(STARTUP_ID, "team")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
