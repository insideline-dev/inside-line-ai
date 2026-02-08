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

describe("StartupService", () => {
  let service: StartupService;
  let drizzleService: jest.Mocked<DrizzleService>;
  let queueService: jest.Mocked<QueueService>;
  let storageService: jest.Mocked<StorageService>;
  let draftService: jest.Mocked<DraftService>;
  let aiConfigService: jest.Mocked<AiConfigService>;
  let pipelineService: jest.Mocked<PipelineService>;

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
    } as unknown as jest.Mocked<AiConfigService>;

    pipelineService = {
      startPipeline: jest.fn().mockResolvedValue("pipeline-run-id"),
      getPipelineStatus: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<PipelineService>;

    service = new StartupService(
      drizzleService,
      queueService,
      storageService,
      draftService,
      aiConfigService,
      pipelineService,
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
      mockDb.limit.mockResolvedValueOnce([approvedStartup]);

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
      expect(queueService.addJob).toHaveBeenCalled();
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
});
