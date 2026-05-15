import { describe, expect, it, beforeEach, afterEach, jest } from "bun:test";
import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
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
import { DrizzleService } from "../../../database";
import { UserRole } from "../../../auth/entities/auth.schema";

const startupId = "11111111-2222-3333-4444-555555555555";
const investor = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  email: "investor@test.com",
  name: "Test Investor",
  role: UserRole.INVESTOR,
  emailVerified: true,
  image: null,
} as never;

describe("InvestorController.rescreenForDev", () => {
  let controller: InvestorController;
  let screeningProcessor: { runScreening: ReturnType<typeof jest.fn> };
  let drizzleInsert: ReturnType<typeof jest.fn>;
  let drizzleValues: ReturnType<typeof jest.fn>;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    drizzleValues = jest.fn().mockResolvedValue(undefined);
    drizzleInsert = jest.fn().mockReturnValue({ values: drizzleValues });
    screeningProcessor = {
      runScreening: jest.fn().mockResolvedValue({
        classification: "review",
        overallScore: 65,
        lenses: [
          { key: "market", score: 70 },
          { key: "team", score: 55 },
          { key: "traction", score: 60 },
        ],
      }),
    };

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
        { provide: DealDecisionService, useValue: {} },
        { provide: CalibrationService, useValue: {} },
        { provide: CalibrationProposalService, useValue: {} },
        { provide: StartupMatchingPipelineService, useValue: {} },
        { provide: ScreeningQueueService, useValue: {} },
        { provide: ScreeningCalibrationService, useValue: {} },
        { provide: ScreeningProcessor, useValue: screeningProcessor },
        {
          provide: DrizzleService,
          useValue: { db: { insert: drizzleInsert } },
        },
      ],
    }).compile();

    controller = module.get(InvestorController);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns 403 in production", async () => {
    process.env.NODE_ENV = "production";
    await expect(
      controller.rescreenForDev(startupId, investor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(screeningProcessor.runScreening).not.toHaveBeenCalled();
  });

  it("returns 403 in test", async () => {
    process.env.NODE_ENV = "test";
    await expect(
      controller.rescreenForDev(startupId, investor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("runs the screening processor and returns its result in development", async () => {
    process.env.NODE_ENV = "development";
    const result = await controller.rescreenForDev(startupId, investor);
    expect(result.ok).toBe(true);
    expect(result.classification).toBe("review");
    expect(result.overallScore).toBe(65);
    expect(result.lensCount).toBe(3);
    expect(result.note).toContain("DD pipeline was NOT triggered");
    expect(screeningProcessor.runScreening).toHaveBeenCalledTimes(1);
    const [calledStartupId, calledPipelineRunId] =
      screeningProcessor.runScreening.mock.calls[0];
    expect(calledStartupId).toBe(startupId);
    expect(calledPipelineRunId).toMatch(/^rescreen_[a-f0-9]{16}$/);
  });

  it("inserts a parent pipeline_run row before runScreening (FK satisfaction)", async () => {
    process.env.NODE_ENV = "development";
    await controller.rescreenForDev(startupId, investor);
    expect(drizzleInsert).toHaveBeenCalledTimes(1);
    expect(drizzleValues).toHaveBeenCalledTimes(1);
    const inserted = drizzleValues.mock.calls[0][0];
    expect(inserted.startupId).toBe(startupId);
    expect(inserted.userId).toBe(investor.id);
    expect(inserted.config).toEqual({ source: "rescreen-dev" });
    // Status COMPLETED so health probes don't flag it as a hung pipeline.
    expect(inserted.status).toBeDefined();
  });

  it("uses a fresh pipelineRunId on every call", async () => {
    process.env.NODE_ENV = "development";
    const r1 = await controller.rescreenForDev(startupId, investor);
    const r2 = await controller.rescreenForDev(startupId, investor);
    expect(r1.pipelineRunId).not.toBe(r2.pipelineRunId);
  });
});
