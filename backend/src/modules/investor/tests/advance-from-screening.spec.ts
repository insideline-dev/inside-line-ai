import { describe, expect, it, beforeEach, jest } from "bun:test";
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { InvestorController } from "../investor.controller";
import { ThesisService } from "../thesis.service";
import { MatchService } from "../match.service";
import { TeamService } from "../team.service";
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
import { DrizzleService } from "../../../database";
import { UserRole } from "../../../auth/entities/auth.schema";

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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestorController],
      providers: [
        { provide: ThesisService, useValue: {} },
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

  it("overrides verdict to 'advance', records the decision, and re-runs from EVALUATION", async () => {
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
    expect(pipelineService.rerunFromPhase).toHaveBeenCalledWith(
      STARTUP_ID,
      "evaluation",
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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestorController],
      providers: [
        { provide: ThesisService, useValue: {} },
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
