import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { StartupService } from "../startup.service";
import { DraftService } from "../draft.service";
import { DrizzleService } from "../../../database";
import { QueueService } from "../../../queue";
import { StorageService } from "../../../storage";
import { StartupStatus, StartupStage } from "../entities/startup.schema";
import { AiConfigService } from "../../ai/services/ai-config.service";
import { PipelineService } from "../../ai/services/pipeline.service";
import { PipelineFeedbackService } from "../../ai/services/pipeline-feedback.service";
import { StartupMatchingPipelineService } from "../../ai/services/startup-matching-pipeline.service";
import {
  PipelineStatus,
  ModelPurpose,
  PipelinePhase,
  type PipelineState,
} from "../../ai/interfaces/pipeline.interface";

describe("StartupService", () => {
  let service: StartupService;
  let drizzleService: jest.Mocked<DrizzleService>;
  let queueService: jest.Mocked<QueueService>;
  let storageService: jest.Mocked<StorageService>;
  let draftService: jest.Mocked<DraftService>;
  let aiConfigService: jest.Mocked<AiConfigService>;
  let pipelineService: jest.Mocked<PipelineService>;
  let pipelineFeedbackService: jest.Mocked<PipelineFeedbackService>;
  let startupMatchingService: jest.Mocked<StartupMatchingPipelineService>;

  const createMockDb = () => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  });

  let mockDb: ReturnType<typeof createMockDb>;

  const mockUserId = "123e4567-e89b-12d3-a456-426614174000";
  const mockStartupId = "123e4567-e89b-12d3-a456-426614174001";

  const mockStartup = {
    id: mockStartupId,
    userId: mockUserId,
    name: "Test Startup",
    slug: "test-startup",
    tagline: "A test startup",
    description:
      "This is a test startup description that is long enough to pass validation requirements.",
    website: "https://test.com",
    location: "San Francisco",
    industry: "SaaS",
    stage: StartupStage.SEED,
    fundingTarget: 1000000,
    teamSize: 5,
    status: StartupStatus.DRAFT,
    pitchDeckUrl: null,
    demoUrl: null,
    submittedAt: null,
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEvaluation = {
    id: "evaluation-1",
    startupId: mockStartupId,
    overallScore: 82,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockDb = createMockDb();

    drizzleService = {
      db: mockDb,
      withRLS: jest.fn((_userId, callback) => callback(mockDb)),
    } as unknown as jest.Mocked<DrizzleService>;

    queueService = {
      addJob: jest.fn(),
    } as unknown as jest.Mocked<QueueService>;

    storageService = {
      getUploadUrl: jest.fn(),
    } as unknown as jest.Mocked<StorageService>;

    draftService = {
      delete: jest.fn(),
    } as unknown as jest.Mocked<DraftService>;

    aiConfigService = {
      isPipelineEnabled: jest.fn().mockReturnValue(true),
      getModelForPurpose: jest.fn((purpose: ModelPurpose) =>
        purpose === ModelPurpose.SYNTHESIS
          ? "gpt-5.2"
          : "gemini-3.0-flash-preview",
      ),
    } as unknown as jest.Mocked<AiConfigService>;

    pipelineService = {
      startPipeline: jest.fn().mockResolvedValue("pipeline-run-id"),
      getPipelineStatus: jest.fn().mockResolvedValue(null),
      getTrackedProgress: jest.fn().mockResolvedValue(null),
      retryPhase: jest.fn().mockResolvedValue(undefined),
      rerunFromPhase: jest.fn().mockResolvedValue(undefined),
      retryAgent: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PipelineService>;

    pipelineFeedbackService = {
      record: jest.fn().mockResolvedValue({ id: "feedback-1" }),
    } as unknown as jest.Mocked<PipelineFeedbackService>;

    startupMatchingService = {
      queueStartupMatching: jest.fn().mockResolvedValue({
        startupId: mockStartupId,
        analysisJobId: "matching-job-1",
        queueJobId: "queue-job-1",
        status: "queued",
        triggerSource: "approval",
      }),
    } as unknown as jest.Mocked<StartupMatchingPipelineService>;

    service = new StartupService(
      drizzleService,
      queueService,
      storageService,
      draftService,
      aiConfigService,
      pipelineService,
      pipelineFeedbackService,
      startupMatchingService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("should create a startup with draft status", async () => {
      const dto = {
        name: "Test Startup",
        tagline: "A test startup",
        description:
          "This is a test startup description that is long enough to pass validation requirements.",
        website: "https://test.com",
        location: "San Francisco",
        industry: "SaaS",
        stage: StartupStage.SEED,
        fundingTarget: 1000000,
        teamSize: 5,
      };

      mockDb.returning.mockResolvedValueOnce([mockStartup]);

      const result = await service.create(mockUserId, dto);

      expect(result).toEqual(mockStartup);
      expect(drizzleService.withRLS).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function),
      );
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should generate a slug from the name", async () => {
      const dto = {
        name: "Test Startup Inc.",
        tagline: "A test startup",
        description:
          "This is a test startup description that is long enough to pass validation requirements.",
        website: "https://test.com",
        location: "San Francisco",
        industry: "SaaS",
        stage: StartupStage.SEED,
        fundingTarget: 1000000,
        teamSize: 5,
      };

      mockDb.returning.mockResolvedValueOnce([
        { ...mockStartup, slug: "test-startup-inc" },
      ]);

      await service.create(mockUserId, dto);

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "test-startup-inc",
          geoCountryCode: "US",
          geoLevel1: "l1:north_america",
          geoLevel2: "l2:us_canada",
          geoLevel3: "l3:us",
          geoPath: ["l1:north_america", "l2:us_canada", "l3:us"],
        }),
      );
    });
  });

  describe("findOne", () => {
    it("should return a startup by id", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);

      const result = await service.findOne(mockStartupId, mockUserId);

      expect(result).toEqual(mockStartup);
      expect(drizzleService.withRLS).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function),
      );
    });

    it("should throw NotFoundException if startup not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.findOne(mockStartupId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should include evaluation data for approved startups", async () => {
      const approvedStartup = {
        ...mockStartup,
        status: StartupStatus.APPROVED,
      };

      mockDb.limit
        .mockResolvedValueOnce([approvedStartup])
        .mockResolvedValueOnce([mockEvaluation]);

      const result = await service.findOne(mockStartupId, mockUserId);

      expect(result).toEqual(
        expect.objectContaining({
          id: mockStartupId,
          evaluation: expect.objectContaining({
            id: mockEvaluation.id,
            startupId: mockEvaluation.startupId,
            overallScore: mockEvaluation.overallScore,
          }),
        }),
      );
      const evaluation = (result as { evaluation?: Record<string, unknown> }).evaluation;
      const sources = Array.isArray(evaluation?.sources)
        ? (evaluation.sources as Array<Record<string, unknown>>)
        : [];
      expect(
        sources.some(
          (source) =>
            source.agent === "TeamAgent" &&
            source.type === "api" &&
            source.model === "gemini-3.0-flash-preview",
        ),
      ).toBe(true);
    });

    it("should synthesize memo narratives when a section only has single-paragraph feedback", async () => {
      const approvedStartup = {
        ...mockStartup,
        status: StartupStatus.APPROVED,
      };
      const evaluationWithSingleParagraphFeedback = {
        ...mockEvaluation,
        teamData: {
          score: 82,
          confidence: 0.68,
          feedback:
            "The founding team has strong category familiarity and early commercial traction, but execution still appears concentrated around core founders with limited evidence of broader management bandwidth and no verified retention segmentation across customer cohorts despite promising initial demand in core channels.",
          keyFindings: ["Founder-market fit is credible", "Early demand signal is present"],
          risks: ["Execution concentration risk"],
          dataGaps: ["No cohort-level retention data"],
        },
      };

      mockDb.limit
        .mockResolvedValueOnce([approvedStartup])
        .mockResolvedValueOnce([evaluationWithSingleParagraphFeedback]);

      const result = await service.findOne(mockStartupId, mockUserId);
      const teamData = (
        (result as { evaluation?: { teamData?: Record<string, unknown> } }).evaluation
          ?.teamData ?? {}
      ) as Record<string, unknown>;

      const narrativeSummary = teamData.narrativeSummary as string | undefined;
      const memoNarrative = teamData.memoNarrative as string | undefined;
      const feedback = teamData.feedback as string | undefined;

      expect(narrativeSummary).toBeTruthy();
      expect(memoNarrative).toBe(narrativeSummary);
      expect(feedback).toBe(narrativeSummary);
      const paragraphs = (narrativeSummary ?? "")
        .split(/\n\s*\n+/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      expect(paragraphs.length).toBeGreaterThanOrEqual(4);
      expect((narrativeSummary ?? "").length).toBeGreaterThan(420);
    });

    it("should not include evaluation data before approval for founders", async () => {
      const reviewingStartup = {
        ...mockStartup,
        status: StartupStatus.PENDING_REVIEW,
      };

      mockDb.limit.mockResolvedValueOnce([reviewingStartup]);

      const result = await service.findOne(mockStartupId, mockUserId);

      expect(result).toEqual(reviewingStartup);
    });
  });

  describe("adminFindOne", () => {
    it("should return startup by id without RLS owner filter", async () => {
      const approvedStartup = {
        ...mockStartup,
        status: StartupStatus.APPROVED,
      };

      mockDb.limit
        .mockResolvedValueOnce([approvedStartup])
        .mockResolvedValueOnce([mockEvaluation]);

      const result = await service.adminFindOne(mockStartupId);

      expect(result).toEqual(
        expect.objectContaining({
          id: mockStartupId,
          evaluation: expect.objectContaining({
            id: mockEvaluation.id,
            startupId: mockEvaluation.startupId,
            overallScore: mockEvaluation.overallScore,
          }),
        }),
      );
      expect(drizzleService.withRLS).not.toHaveBeenCalled();
    });

    it("should throw NotFoundException when startup does not exist", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.adminFindOne(mockStartupId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should include evaluation data during pending review for admins", async () => {
      const reviewingStartup = {
        ...mockStartup,
        status: StartupStatus.PENDING_REVIEW,
      };

      mockDb.limit
        .mockResolvedValueOnce([reviewingStartup])
        .mockResolvedValueOnce([mockEvaluation]);

      const result = await service.adminFindOne(mockStartupId);

      expect(result).toEqual(
        expect.objectContaining({
          id: mockStartupId,
          evaluation: expect.objectContaining({
            id: mockEvaluation.id,
            startupId: mockEvaluation.startupId,
            overallScore: mockEvaluation.overallScore,
          }),
        }),
      );
    });
  });

  describe("update", () => {
    it("should update a draft startup", async () => {
      const dto = { name: "Updated Name" };

      mockDb.limit.mockResolvedValueOnce([mockStartup]);
      mockDb.returning.mockResolvedValueOnce([
        { ...mockStartup, name: "Updated Name" },
      ]);

      const result = await service.update(mockStartupId, mockUserId, dto);

      expect(result.name).toBe("Updated Name");
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("should throw ForbiddenException if startup is submitted", async () => {
      const submittedStartup = {
        ...mockStartup,
        status: StartupStatus.SUBMITTED,
      };
      mockDb.limit.mockResolvedValueOnce([submittedStartup]);

      await expect(
        service.update(mockStartupId, mockUserId, { name: "Updated" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException if startup is approved", async () => {
      const approvedStartup = {
        ...mockStartup,
        status: StartupStatus.APPROVED,
      };
      mockDb.limit
        .mockResolvedValueOnce([approvedStartup])
        .mockResolvedValueOnce([]);

      await expect(
        service.update(mockStartupId, mockUserId, { name: "Updated" }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("delete", () => {
    it("should delete a draft startup", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);

      await service.delete(mockStartupId, mockUserId);

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("should throw ForbiddenException if startup is not draft", async () => {
      const submittedStartup = {
        ...mockStartup,
        status: StartupStatus.SUBMITTED,
      };
      mockDb.limit.mockResolvedValueOnce([submittedStartup]);

      await expect(service.delete(mockStartupId, mockUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("submit", () => {
    it("should submit a draft startup", async () => {
      const submittedStartup = {
        ...mockStartup,
        status: StartupStatus.SUBMITTED,
        submittedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([mockStartup]);
      mockDb.returning.mockResolvedValueOnce([submittedStartup]);

      const result = await service.submit(mockStartupId, mockUserId);

      expect(result.status).toBe(StartupStatus.SUBMITTED);
      expect(result.submittedAt).toBeTruthy();
      expect(pipelineService.startPipeline).toHaveBeenCalledWith(
        mockStartupId,
        mockUserId,
      );
      expect(draftService.delete).toHaveBeenCalledWith(mockStartupId);
    });

    it("should throw BadRequestException if startup is not draft", async () => {
      const submittedStartup = {
        ...mockStartup,
        status: StartupStatus.SUBMITTED,
      };
      mockDb.limit.mockResolvedValueOnce([submittedStartup]);

      await expect(service.submit(mockStartupId, mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should fallback to legacy queue when ai pipeline is disabled", async () => {
      const submittedStartup = {
        ...mockStartup,
        status: StartupStatus.SUBMITTED,
        submittedAt: new Date(),
      };
      aiConfigService.isPipelineEnabled.mockReturnValueOnce(false);
      mockDb.limit.mockResolvedValueOnce([mockStartup]);
      mockDb.returning.mockResolvedValueOnce([submittedStartup]);

      await service.submit(mockStartupId, mockUserId);

      expect(queueService.addJob).toHaveBeenCalled();
      expect(pipelineService.startPipeline).not.toHaveBeenCalled();
    });
  });

  describe("resubmit", () => {
    it("should resubmit a rejected startup", async () => {
      const rejectedStartup = {
        ...mockStartup,
        status: StartupStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: "Not ready",
      };

      const resubmittedStartup = {
        ...rejectedStartup,
        status: StartupStatus.SUBMITTED,
        submittedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
      };

      mockDb.limit.mockResolvedValueOnce([rejectedStartup]);
      mockDb.returning.mockResolvedValueOnce([resubmittedStartup]);

      const result = await service.resubmit(mockStartupId, mockUserId);

      expect(result.status).toBe(StartupStatus.SUBMITTED);
      expect(result.rejectionReason).toBeNull();
      expect(pipelineService.startPipeline).toHaveBeenCalledWith(
        mockStartupId,
        mockUserId,
      );
    });

    it("should throw BadRequestException if startup is not rejected", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);

      await expect(service.resubmit(mockStartupId, mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("approve", () => {
    it("should approve a submitted startup", async () => {
      const submittedStartup = {
        ...mockStartup,
        status: StartupStatus.SUBMITTED,
      };
      const approvedStartup = {
        ...submittedStartup,
        status: StartupStatus.APPROVED,
        approvedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([submittedStartup]);
      mockDb.returning.mockResolvedValueOnce([approvedStartup]);

      const result = await service.approve(mockStartupId, mockUserId);

      expect(result.status).toBe(StartupStatus.APPROVED);
      expect(result.approvedAt).toBeTruthy();
      expect(startupMatchingService.queueStartupMatching).toHaveBeenCalledWith({
        startupId: mockStartupId,
        requestedBy: mockUserId,
        triggerSource: "approval",
      });
    });

    it("should throw NotFoundException if startup not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.approve(mockStartupId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException if startup is not submitted", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);

      await expect(service.approve(mockStartupId, mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("does not fail approval when matching queueing fails", async () => {
      const submittedStartup = {
        ...mockStartup,
        status: StartupStatus.SUBMITTED,
      };
      const approvedStartup = {
        ...submittedStartup,
        status: StartupStatus.APPROVED,
        approvedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([submittedStartup]);
      mockDb.returning.mockResolvedValueOnce([approvedStartup]);
      startupMatchingService.queueStartupMatching.mockRejectedValueOnce(
        new Error("queue offline"),
      );

      const result = await service.approve(mockStartupId, mockUserId);

      expect(result.status).toBe(StartupStatus.APPROVED);
      expect(startupMatchingService.queueStartupMatching).toHaveBeenCalledTimes(1);
    });
  });

  describe("reject", () => {
    it("should reject a submitted startup", async () => {
      const submittedStartup = {
        ...mockStartup,
        status: StartupStatus.SUBMITTED,
      };
      const rejectedStartup = {
        ...submittedStartup,
        status: StartupStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: "Not ready",
      };

      mockDb.limit.mockResolvedValueOnce([submittedStartup]);
      mockDb.returning.mockResolvedValueOnce([rejectedStartup]);

      const result = await service.reject(
        mockStartupId,
        mockUserId,
        "Not ready",
      );

      expect(result.status).toBe(StartupStatus.REJECTED);
      expect(result.rejectionReason).toBe("Not ready");
    });

    it("should throw BadRequestException if startup is not submitted", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);

      await expect(
        service.reject(mockStartupId, mockUserId, "Not ready"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("getUploadUrl", () => {
    it("should generate presigned upload URL", async () => {
      const dto = {
        fileName: "pitch.pdf",
        fileType: "application/pdf",
        fileSize: 1024000,
      };

      const mockUploadUrl = {
        uploadUrl: "https://upload.com",
        key: "key123",
        publicUrl: "https://public.com",
      };

      mockDb.limit.mockResolvedValueOnce([mockStartup]);
      storageService.getUploadUrl.mockResolvedValueOnce(mockUploadUrl);

      const result = await service.getUploadUrl(mockStartupId, mockUserId, dto);

      expect(result).toEqual(mockUploadUrl);
      expect(storageService.getUploadUrl).toHaveBeenCalled();
    });
  });

  describe("getProgress", () => {
    it("should return null progress when no pipeline state or job exists", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);

      const result = await service.getProgress(mockStartupId, mockUserId);

      expect(result).toEqual({
        status: mockStartup.status,
        progress: null,
      });
    });

    it("should hide detailed agent telemetry for non-admin progress responses", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);
      pipelineService.getTrackedProgress.mockResolvedValueOnce({
        pipelineRunId: "run-telemetry",
        startupId: mockStartupId,
        status: PipelineStatus.RUNNING,
        currentPhase: PipelinePhase.EVALUATION,
        overallProgress: 60,
        phasesCompleted: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING],
        phases: {
          [PipelinePhase.EXTRACTION]: {
            status: "completed",
            agents: {},
          },
          [PipelinePhase.SCRAPING]: {
            status: "completed",
            agents: {},
          },
          [PipelinePhase.RESEARCH]: {
            status: "completed",
            agents: {},
          },
          [PipelinePhase.EVALUATION]: {
            status: "running",
            retryCount: 1,
            agents: {
              traction: {
                key: "traction",
                status: "running",
                progress: 0,
                attempts: 2,
                retryCount: 1,
                usedFallback: false,
                lastEvent: "retrying",
                lastEventAt: new Date().toISOString(),
              },
            },
          },
          [PipelinePhase.SYNTHESIS]: {
            status: "pending",
            agents: {},
          },
        },
        agentEvents: [
          {
            id: "evt-1",
            phase: PipelinePhase.EVALUATION,
            agentKey: "traction",
            event: "retrying",
            timestamp: new Date().toISOString(),
            attempt: 2,
            retryCount: 1,
            error: "No output generated",
          },
        ],
        updatedAt: new Date().toISOString(),
      } as any);

      const result = await service.getProgress(mockStartupId, mockUserId);
      const traction = result.progress?.phases?.[PipelinePhase.EVALUATION]?.agents?.traction;

      expect(traction?.retryCount).toBeUndefined();
      expect(traction?.lastEvent).toBeUndefined();
      expect(result.progress?.agentEvents).toBeUndefined();
    });
  });

  describe("adminGetProgress", () => {
    it("should return progress for any startup id", async () => {
      const analyzingStartup = {
        ...mockStartup,
        status: StartupStatus.ANALYZING,
      };
      mockDb.limit
        .mockResolvedValueOnce([analyzingStartup])
        .mockResolvedValueOnce([]);

      const result = await service.adminGetProgress(mockStartupId);

      expect(result.status).toBe(StartupStatus.ANALYZING);
      expect(drizzleService.withRLS).not.toHaveBeenCalled();
    });

    it("should throw NotFoundException when startup not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.adminGetProgress(mockStartupId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should include detailed agent telemetry for admin progress responses", async () => {
      const analyzingStartup = {
        ...mockStartup,
        status: StartupStatus.ANALYZING,
      };
      mockDb.limit.mockResolvedValueOnce([analyzingStartup]);
      pipelineService.getTrackedProgress.mockResolvedValueOnce({
        pipelineRunId: "run-telemetry",
        startupId: mockStartupId,
        status: PipelineStatus.RUNNING,
        currentPhase: PipelinePhase.EVALUATION,
        overallProgress: 65,
        phasesCompleted: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING],
        phases: {
          [PipelinePhase.EXTRACTION]: {
            status: "completed",
            agents: {},
          },
          [PipelinePhase.SCRAPING]: {
            status: "completed",
            agents: {},
          },
          [PipelinePhase.RESEARCH]: {
            status: "completed",
            agents: {},
          },
          [PipelinePhase.EVALUATION]: {
            status: "running",
            retryCount: 2,
            agents: {
              traction: {
                key: "traction",
                status: "running",
                progress: 0,
                attempts: 3,
                retryCount: 2,
                usedFallback: false,
                lastEvent: "retrying",
                lastEventAt: new Date().toISOString(),
              },
            },
          },
          [PipelinePhase.SYNTHESIS]: {
            status: "pending",
            agents: {},
          },
        },
        agentEvents: [
          {
            id: "evt-1",
            phase: PipelinePhase.EVALUATION,
            agentKey: "traction",
            event: "retrying",
            timestamp: new Date().toISOString(),
            attempt: 3,
            retryCount: 2,
            error: "No output generated",
          },
        ],
        updatedAt: new Date().toISOString(),
      } as any);

      const result = await service.adminGetProgress(mockStartupId);
      const traction = result.progress?.phases?.[PipelinePhase.EVALUATION]?.agents?.traction;

      expect(result.progress?.agentEvents?.[0]).toEqual(
        expect.objectContaining({
          agentKey: "traction",
          event: "retrying",
          retryCount: 2,
        }),
      );
      expect(result.progress?.phases?.[PipelinePhase.EVALUATION]?.retryCount).toBe(2);
      expect(traction).toEqual(
        expect.objectContaining({
          retryCount: 2,
          attempts: 3,
          lastEvent: "retrying",
        }),
      );
    });
  });

  describe("adminRetryPhase", () => {
    it("should forward phase retry request to pipeline service", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);

      const result = await service.adminRetryPhase(mockStartupId, mockUserId, {
        phase: "evaluation" as any,
        forceRerun: false,
        feedback: "Please verify unit economics with updated assumptions.",
      });

      expect(result.accepted).toBe(true);
      expect(pipelineService.retryPhase).toHaveBeenCalledWith(
        mockStartupId,
        "evaluation",
      );
      expect(pipelineFeedbackService.record).toHaveBeenCalledTimes(1);
    });

    it("should force rerun from selected phase when requested", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);

      await service.adminRetryPhase(mockStartupId, mockUserId, {
        phase: "research" as any,
        forceRerun: true,
      });

      expect(pipelineService.rerunFromPhase).toHaveBeenCalledWith(
        mockStartupId,
        "research",
      );
      expect(pipelineService.retryPhase).not.toHaveBeenCalled();
    });

    it("should throw when startup is missing", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.adminRetryPhase(mockStartupId, mockUserId, {
          phase: "evaluation" as any,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should reject retry when pipeline is disabled", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);
      aiConfigService.isPipelineEnabled.mockReturnValueOnce(false);

      await expect(
        service.adminRetryPhase(mockStartupId, mockUserId, {
          phase: "evaluation" as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject unsupported phase values", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);

      await expect(
        service.adminRetryPhase(mockStartupId, mockUserId, {
          phase: "invalid-phase" as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("adminRetryAgent", () => {
    it("should queue targeted retry for agent retry request", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);
      pipelineService.getPipelineStatus.mockResolvedValueOnce({
        pipelineRunId: "run-existing",
        startupId: mockStartupId,
        userId: mockUserId,
        status: PipelineStatus.COMPLETED,
        quality: "standard",
        currentPhase: PipelinePhase.SYNTHESIS,
        phases: {} as any,
        results: {},
        retryCounts: {},
        telemetry: {
          startedAt: new Date().toISOString(),
          totalTokens: { input: 0, output: 0 },
          phases: {} as any,
          agents: {},
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as PipelineState);

      const result = await service.adminRetryAgent(mockStartupId, mockUserId, {
        phase: "evaluation" as any,
        agent: "market",
        feedback: "Re-check TAM assumptions using current benchmarks.",
      });

      expect(result.accepted).toBe(true);
      expect(pipelineService.retryAgent).toHaveBeenCalledWith(
        mockStartupId,
        {
          phase: "evaluation",
          agentKey: "market",
        },
      );
      expect(result.mode).toBe("agent_retry");
      expect(pipelineService.startPipeline).not.toHaveBeenCalled();
      expect(pipelineFeedbackService.record).toHaveBeenCalledTimes(1);
    });

    it("falls back to full reanalysis when pipeline state is missing", async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          ...mockStartup,
          userId: "different-owner-id",
        },
      ]);
      pipelineService.getPipelineStatus.mockResolvedValueOnce(null);

      const result = await service.adminRetryAgent(mockStartupId, mockUserId, {
        phase: "evaluation" as any,
        agent: "market",
        feedback: "Re-check TAM assumptions using current benchmarks.",
      });

      expect(result.accepted).toBe(true);
      expect(result.mode).toBe("full_reanalysis_fallback");
      expect(pipelineService.retryAgent).not.toHaveBeenCalled();
      expect(pipelineService.startPipeline).toHaveBeenCalledWith(
        mockStartupId,
        mockUserId,
      );
    });

    it("accepts competitor as a valid research agent", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);
      pipelineService.getPipelineStatus.mockResolvedValueOnce({
        pipelineRunId: "run-existing",
        startupId: mockStartupId,
        userId: mockUserId,
        status: PipelineStatus.COMPLETED,
        quality: "standard",
        currentPhase: PipelinePhase.SYNTHESIS,
        phases: {
          [PipelinePhase.EXTRACTION]: { status: "completed" as any },
          [PipelinePhase.ENRICHMENT]: { status: "completed" as any },
          [PipelinePhase.SCRAPING]: { status: "completed" as any },
          [PipelinePhase.RESEARCH]: { status: "completed" as any },
          [PipelinePhase.EVALUATION]: { status: "completed" as any },
          [PipelinePhase.SYNTHESIS]: { status: "completed" as any },
        } as any,
        results: {},
        retryCounts: {},
        telemetry: {
          startedAt: new Date().toISOString(),
          totalTokens: { input: 0, output: 0 },
          phases: {} as any,
          agents: {},
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as PipelineState);

      const result = await service.adminRetryAgent(mockStartupId, mockUserId, {
        phase: "research" as any,
        agent: "competitor",
      });

      expect(result.accepted).toBe(true);
      expect(result.mode).toBe("agent_retry");
      expect(pipelineService.retryAgent).toHaveBeenCalledWith(
        mockStartupId,
        {
          phase: "research",
          agentKey: "competitor",
        },
      );
    });

    it("should reject unsupported phase-agent combinations", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);

      await expect(
        service.adminRetryAgent(mockStartupId, mockUserId, {
          phase: "research" as any,
          agent: "financials",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject retry agent when pipeline is disabled", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);
      aiConfigService.isPipelineEnabled.mockReturnValueOnce(false);

      await expect(
        service.adminRetryAgent(mockStartupId, mockUserId, {
          phase: "evaluation" as any,
          agent: "market",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("buildProgressResponse", () => {
    it("returns 0 overallProgress when pipeline phase map is empty", async () => {
      const analyzingStartup = {
        ...mockStartup,
        status: StartupStatus.ANALYZING,
      };
      mockDb.limit.mockResolvedValueOnce([analyzingStartup]);
      pipelineService.getPipelineStatus.mockResolvedValueOnce({
        pipelineRunId: "run-1",
        startupId: mockStartupId,
        userId: mockUserId,
        status: PipelineStatus.RUNNING,
        quality: "standard",
        currentPhase: PipelinePhase.EXTRACTION,
        phases: {},
        results: {},
        retryCounts: {},
        telemetry: {
          startedAt: new Date().toISOString(),
          totalTokens: { input: 0, output: 0 },
          phases: {},
          agents: {},
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as PipelineState);

      const result = await service.getProgress(mockStartupId, mockUserId);

      expect(result.progress?.overallProgress).toBe(0);
    });
  });
});
