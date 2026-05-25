import { describe, expect, it, beforeEach, jest } from "bun:test";
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { InvestorController } from "../investor.controller";
import { ThesisService } from "../thesis.service";
import { MatchService } from "../match.service";
import { TeamService } from "../team.service";
import { DealbreakerParseService } from "../dealbreaker-parse.service";
import { InvestorNoteService } from "../investor-note.service";
import { PortfolioService } from "../portfolio.service";
import { DealPipelineService } from "../deal-pipeline.service";
import { MessagingService } from "../messaging.service";
import { ScoringPreferencesService } from "../scoring-preferences.service";
import { ScoringConfigService } from "../../admin/scoring-config.service";
import { CalibrationService } from "../calibration.service";
import { CalibrationProposalService } from "../calibration-proposal.service";
import { DealDecisionService } from "../deal-decision.service";
import { StartupMatchingPipelineService } from "../../ai/services/startup-matching-pipeline.service";
import { ScreeningQueueService } from "../screening-queue.service";
import { ScreeningCalibrationService } from "../screening-calibration.service";
import { ScreeningProcessor } from "../../ai/processors/screening.processor";
import { PipelineService } from "../../ai/services/pipeline.service";
import { ProgressTrackerService } from "../../ai/orchestrator/progress-tracker.service";
import { PipelineStateService } from "../../ai/services/pipeline-state.service";
import { DrizzleService } from "../../../database";
import { UserRole } from "../../../auth/entities/auth.schema";
import { DealEventService } from "../../startup/deal-event.service";

const STARTUP_ID = "11111111-2222-4222-8444-555555555555";
const investor = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  email: "investor@test.com",
  name: "Test Investor",
  role: UserRole.INVESTOR,
  emailVerified: true,
  image: null,
} as never;

describe("InvestorController.advanceFromScreening", () => {
  let controller: InvestorController;
  let drizzleSelectMock: ReturnType<typeof jest.fn>;
  let drizzleUpdateMock: ReturnType<typeof jest.fn>;
  let pipelineService: { rerunFromPhase: ReturnType<typeof jest.fn> };
  let dealDecisionService: { record: ReturnType<typeof jest.fn> };
  let dealEvents: { record: ReturnType<typeof jest.fn> };

  function buildSelectMock(latestRow: { id: string } | null) {
    const limit = jest.fn().mockResolvedValue(latestRow ? [latestRow] : []);
    const orderBy = jest.fn().mockReturnValue({ limit });
    const where = jest.fn().mockReturnValue({ orderBy });
    const from = jest.fn().mockReturnValue({ where });
    return jest.fn().mockReturnValue({ from });
  }

  function buildUpdateMock() {
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn().mockReturnValue({ where });
    return jest.fn().mockReturnValue({ set });
  }

  beforeEach(async () => {
    drizzleSelectMock = buildSelectMock({ id: "decision-1" });
    drizzleUpdateMock = buildUpdateMock();
    pipelineService = { rerunFromPhase: jest.fn().mockResolvedValue(undefined) };
    dealDecisionService = { record: jest.fn().mockResolvedValue({}) };
    dealEvents = { record: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestorController],
      providers: [
        { provide: ThesisService, useValue: {} },
        { provide: DealbreakerParseService, useValue: {} },
        { provide: MatchService, useValue: {} },
        { provide: TeamService, useValue: {} },
        { provide: InvestorNoteService, useValue: {} },
        { provide: PortfolioService, useValue: {} },
        { provide: DealPipelineService, useValue: {} },
        { provide: MessagingService, useValue: {} },
        { provide: ScoringPreferencesService, useValue: {} },
        { provide: ScoringConfigService, useValue: {} },
        { provide: DealDecisionService, useValue: dealDecisionService },
        { provide: CalibrationService, useValue: {} },
        { provide: CalibrationProposalService, useValue: {} },
        { provide: StartupMatchingPipelineService, useValue: {} },
        { provide: ScreeningQueueService, useValue: {} },
        { provide: ScreeningCalibrationService, useValue: {} },
        { provide: ScreeningProcessor, useValue: {} },
        { provide: PipelineService, useValue: pipelineService },
        {
          provide: ProgressTrackerService,
          useValue: {
            initProgress: jest.fn(),
            updatePhaseProgress: jest.fn(),
          },
        },
        {
          provide: PipelineStateService,
          // Truthy values → upstream-ready precheck passes → endpoint picks
          // the rerun_from_eval path (covered by the advance assertions).
          useValue: {
            getPhaseResult: jest
              .fn()
              .mockResolvedValue({ stub: 'phase-result' }),
            setPhaseResult: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: DealEventService, useValue: dealEvents },
        {
          provide: DrizzleService,
          useValue: {
            db: { select: drizzleSelectMock, update: drizzleUpdateMock },
          },
        },
      ],
    }).compile();

    controller = module.get(InvestorController);
  });

  it("404s if no screening_decision exists for the startup", async () => {
    drizzleSelectMock = buildSelectMock(null);
    (controller as unknown as { drizzle: { db: { select: typeof drizzleSelectMock; update: typeof drizzleUpdateMock } } }).drizzle = {
      db: { select: drizzleSelectMock, update: drizzleUpdateMock },
    };
    await expect(
      controller.advanceFromScreening(STARTUP_ID, investor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(pipelineService.rerunFromPhase).not.toHaveBeenCalled();
  });

  it("overrides verdict to 'advance', syncs cached screening state, and queues DD", async () => {
    const res = await controller.advanceFromScreening(STARTUP_ID, investor);
    expect(res.ok).toBe(true);
    expect(res.verdict).toBe("advance");
    expect(res.note).toMatch(/Evaluation \+ synthesis queued/);
    expect(drizzleUpdateMock).toHaveBeenCalled();
    expect(dealDecisionService.record).toHaveBeenCalledWith(
      investor.id,
      STARTUP_ID,
      expect.objectContaining({ verdict: "advance" }),
    );
    expect((controller as unknown as { pipelineState: { setPhaseResult: ReturnType<typeof jest.fn> } }).pipelineState.setPhaseResult).toHaveBeenCalledWith(
      STARTUP_ID,
      "screening",
      expect.objectContaining({
        classification: "advance",
        nextAction: "continue_evaluation",
        missingMaterials: [],
      }),
    );
    expect(pipelineService.rerunFromPhase).toHaveBeenCalledWith(
      STARTUP_ID,
      "evaluation",
    );
    expect(dealEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: STARTUP_ID,
        actorUserId: investor.id,
        type: "due_diligence.started",
      }),
    );
  });

  // DS-E7-F3-S1 — partner-supplied reason tags and notes flow into the
  // deal-decision record alongside the default override tag, so the
  // calibration loop sees WHY the partner overrode.
  it("forwards partner reason codes + notes to the audit record (DS-E7-F3)", async () => {
    await controller.advanceFromScreening(STARTUP_ID, investor, {
      reasonTags: ["team_quality", "market_size_too_small_to_kill"],
      notes: "Partner override after meeting the founder.",
    });
    expect(dealDecisionService.record).toHaveBeenCalledWith(
      investor.id,
      STARTUP_ID,
      expect.objectContaining({
        verdict: "advance",
        reasonTags: [
          "screening_review_overridden",
          "team_quality",
          "market_size_too_small_to_kill",
        ],
        notes: "Partner override after meeting the founder.",
      }),
    );
  });

  it("falls back to the default tag when no body is sent (back-compat)", async () => {
    await controller.advanceFromScreening(STARTUP_ID, investor);
    expect(dealDecisionService.record).toHaveBeenCalledWith(
      investor.id,
      STARTUP_ID,
      expect.objectContaining({
        verdict: "advance",
        reasonTags: ["screening_review_overridden"],
      }),
    );
  });

  it("falls back to fresh_full_pipeline when upstream phase results are missing", async () => {
    // Build a fresh module where PipelineStateService.getPhaseResult
    // returns null for all phases — the upstream-ready precheck must
    // detect this and skip rerunFromPhase entirely.
    const startPipelineMock = jest.fn().mockResolvedValue('new-run-id');
    const localPipelineService = {
      rerunFromPhase: jest.fn(),
      startPipeline: startPipelineMock,
    };
    const localStateService = {
      getPhaseResult: jest.fn().mockResolvedValue(null),
      setPhaseResult: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestorController],
      providers: [
        { provide: ThesisService, useValue: {} },
        { provide: DealbreakerParseService, useValue: {} },
        { provide: MatchService, useValue: {} },
        { provide: TeamService, useValue: {} },
        { provide: InvestorNoteService, useValue: {} },
        { provide: PortfolioService, useValue: {} },
        { provide: DealPipelineService, useValue: {} },
        { provide: MessagingService, useValue: {} },
        { provide: ScoringPreferencesService, useValue: {} },
        { provide: ScoringConfigService, useValue: {} },
        { provide: DealDecisionService, useValue: dealDecisionService },
        { provide: CalibrationService, useValue: {} },
        { provide: CalibrationProposalService, useValue: {} },
        { provide: StartupMatchingPipelineService, useValue: {} },
        { provide: ScreeningQueueService, useValue: {} },
        { provide: ScreeningCalibrationService, useValue: {} },
        { provide: ScreeningProcessor, useValue: {} },
        { provide: PipelineService, useValue: localPipelineService },
        {
          provide: ProgressTrackerService,
          useValue: { initProgress: jest.fn(), updatePhaseProgress: jest.fn() },
        },
        { provide: PipelineStateService, useValue: localStateService },
        { provide: DealEventService, useValue: dealEvents },
        {
          provide: DrizzleService,
          useValue: {
            db: { select: drizzleSelectMock, update: drizzleUpdateMock },
          },
        },
      ],
    }).compile();
    const localController = module.get(InvestorController);
    const res = await localController.advanceFromScreening(STARTUP_ID, investor);
    expect(res.ok).toBe(true);
    expect(res.path).toBe('fresh_full_pipeline');
    expect(localPipelineService.rerunFromPhase).not.toHaveBeenCalled();
    expect(startPipelineMock).toHaveBeenCalledWith(
      STARTUP_ID,
      investor.id,
      expect.objectContaining({ skipExtraction: true }),
    );
  });

  it("translates pipeline.service errors into a clearer 404", async () => {
    pipelineService.rerunFromPhase = jest
      .fn()
      .mockRejectedValue(new Error("Pipeline state not found"));
    await expect(
      controller.advanceFromScreening(STARTUP_ID, investor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("InvestorController.passFromScreening", () => {
  let controller: InvestorController;
  let drizzleSelectMock: ReturnType<typeof jest.fn>;
  let drizzleUpdateMock: ReturnType<typeof jest.fn>;
  let dealDecisionService: { record: ReturnType<typeof jest.fn> };
  let dealEvents: { record: ReturnType<typeof jest.fn> };

  beforeEach(async () => {
    const latestRow = { id: "decision-1" };
    const limit = jest.fn().mockResolvedValue([latestRow]);
    const orderBy = jest.fn().mockReturnValue({ limit });
    const where = jest.fn().mockReturnValue({ orderBy });
    const from = jest.fn().mockReturnValue({ where });
    drizzleSelectMock = jest.fn().mockReturnValue({ from });
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn().mockReturnValue({ where: updateWhere });
    drizzleUpdateMock = jest.fn().mockReturnValue({ set });
    dealDecisionService = { record: jest.fn().mockResolvedValue({}) };
    dealEvents = { record: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestorController],
      providers: [
        { provide: ThesisService, useValue: {} },
        { provide: DealbreakerParseService, useValue: {} },
        { provide: MatchService, useValue: {} },
        { provide: TeamService, useValue: {} },
        { provide: InvestorNoteService, useValue: {} },
        { provide: PortfolioService, useValue: {} },
        { provide: DealPipelineService, useValue: {} },
        { provide: MessagingService, useValue: {} },
        { provide: ScoringPreferencesService, useValue: {} },
        { provide: ScoringConfigService, useValue: {} },
        { provide: DealDecisionService, useValue: dealDecisionService },
        { provide: CalibrationService, useValue: {} },
        { provide: CalibrationProposalService, useValue: {} },
        { provide: StartupMatchingPipelineService, useValue: {} },
        { provide: ScreeningQueueService, useValue: {} },
        { provide: ScreeningCalibrationService, useValue: {} },
        { provide: ScreeningProcessor, useValue: {} },
        { provide: PipelineService, useValue: { rerunFromPhase: jest.fn() } },
        {
          provide: ProgressTrackerService,
          useValue: {
            initProgress: jest.fn(),
            updatePhaseProgress: jest.fn(),
          },
        },
        {
          provide: PipelineStateService,
          // Truthy values → upstream-ready precheck passes → endpoint picks
          // the rerun_from_eval path (covered by the advance assertions).
          useValue: {
            getPhaseResult: jest
              .fn()
              .mockResolvedValue({ stub: 'phase-result' }),
            setPhaseResult: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: DealEventService, useValue: dealEvents },
        {
          provide: DrizzleService,
          useValue: {
            db: { select: drizzleSelectMock, update: drizzleUpdateMock },
          },
        },
      ],
    }).compile();
    controller = module.get(InvestorController);
  });

  it("overrides verdict to 'reject' and records pass decision", async () => {
    const res = await controller.passFromScreening(STARTUP_ID, investor);
    expect(res.ok).toBe(true);
    expect(res.verdict).toBe("reject");
    expect(dealDecisionService.record).toHaveBeenCalledWith(
      investor.id,
      STARTUP_ID,
      expect.objectContaining({ verdict: "pass" }),
    );
  });
});
