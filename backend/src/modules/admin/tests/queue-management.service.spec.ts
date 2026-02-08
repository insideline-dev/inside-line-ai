import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { QueueManagementService } from "../queue-management.service";
import { QueueService, QUEUE_NAMES } from "../../../queue";

describe("QueueManagementService", () => {
  let service: QueueManagementService;
  let queueService: jest.Mocked<QueueService>;

  const mockQueue = {
    getJobCounts: jest.fn(),
    getJobs: jest.fn(),
    getJob: jest.fn(),
    clean: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueManagementService,
        {
          provide: QueueService,
          useValue: {
            getQueue: jest.fn().mockReturnValue(mockQueue),
          },
        },
      ],
    }).compile();

    service = module.get<QueueManagementService>(QueueManagementService);
    queueService = module.get(QueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getStatus", () => {
    it("should return queue status for all queues", async () => {
      const queueCount = Object.values(QUEUE_NAMES).length;

      mockQueue.getJobCounts.mockResolvedValue({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
      });

      const result = await service.getStatus();

      expect(result.queues).toHaveLength(queueCount);
      expect(result.queues[0].name).toBe(QUEUE_NAMES.TASK);
      expect(result.queues[0].waiting).toBe(5);
      expect(result.queues[0].active).toBe(2);
      expect(result.totalPending).toBe(6 * queueCount); // waiting + delayed
      expect(result.totalActive).toBe(2 * queueCount);
      expect(result.totalFailed).toBe(3 * queueCount);
    });

    it("should handle missing queue gracefully", async () => {
      mockQueue.getJobCounts.mockResolvedValue({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      });
      queueService.getQueue.mockReturnValueOnce(undefined);

      const result = await service.getStatus();

      expect(result.queues[0].waiting).toBe(0);
      expect(result.queues[0].active).toBe(0);
    });
  });

  describe("getFailedJobs", () => {
    const mockJob = {
      id: "job-1",
      name: "test-job",
      progress: 0,
      data: { test: true },
      returnvalue: null,
      failedReason: "Test failure",
      attemptsMade: 3,
      timestamp: Date.now(),
      finishedOn: Date.now(),
      getState: jest.fn().mockResolvedValue("failed"),
    };

    it("should return failed jobs", async () => {
      mockQueue.getJobs.mockResolvedValueOnce([mockJob]);

      const result = await service.getFailedJobs(QUEUE_NAMES.TASK);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("job-1");
      expect(result[0].state).toBe("failed");
      expect(result[0].failedReason).toBe("Test failure");
    });

    it("should throw if queue not found", async () => {
      queueService.getQueue.mockReturnValueOnce(undefined);

      await expect(service.getFailedJobs(QUEUE_NAMES.TASK)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should respect limit parameter", async () => {
      mockQueue.getJobs.mockResolvedValueOnce([mockJob]);

      await service.getFailedJobs(QUEUE_NAMES.TASK, 5);

      expect(mockQueue.getJobs).toHaveBeenCalledWith(["failed"], 0, 4);
    });
  });

  describe("retryJob", () => {
    const mockJob = {
      id: "job-1",
      getState: jest.fn().mockResolvedValue("failed"),
      retry: jest.fn(),
    };

    it("should retry a failed job", async () => {
      mockQueue.getJob.mockResolvedValueOnce(mockJob);

      const result = await service.retryJob(QUEUE_NAMES.TASK, "job-1");

      expect(result.success).toBe(true);
      expect(mockJob.retry).toHaveBeenCalled();
    });

    it("should throw if queue not found", async () => {
      queueService.getQueue.mockReturnValueOnce(undefined);

      await expect(service.retryJob(QUEUE_NAMES.TASK, "job-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw if job not found", async () => {
      mockQueue.getJob.mockResolvedValueOnce(null);

      await expect(
        service.retryJob(QUEUE_NAMES.TASK, "non-existent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should not retry jobs that are not failed", async () => {
      const activeJob = {
        ...mockJob,
        getState: jest.fn().mockResolvedValue("active"),
      };
      mockQueue.getJob.mockResolvedValueOnce(activeJob);

      const result = await service.retryJob(QUEUE_NAMES.TASK, "job-1");

      expect(result.success).toBe(false);
      expect(result.message).toContain("not in failed state");
      expect(activeJob.retry).not.toHaveBeenCalled();
    });
  });

  describe("cleanQueue", () => {
    it("should clean completed jobs", async () => {
      mockQueue.clean.mockResolvedValueOnce(["job-1", "job-2", "job-3"]);

      const result = await service.cleanQueue(
        QUEUE_NAMES.TASK,
        "completed",
        3600000,
      );

      expect(result.cleaned).toBe(3);
      expect(mockQueue.clean).toHaveBeenCalledWith(3600000, 1000, "completed");
    });

    it("should clean failed jobs", async () => {
      mockQueue.clean.mockResolvedValueOnce(["job-1"]);

      const result = await service.cleanQueue(QUEUE_NAMES.TASK, "failed");

      expect(result.cleaned).toBe(1);
      expect(mockQueue.clean).toHaveBeenCalledWith(3600000, 1000, "failed");
    });

    it("should throw if queue not found", async () => {
      queueService.getQueue.mockReturnValueOnce(undefined);

      await expect(
        service.cleanQueue(QUEUE_NAMES.TASK, "completed"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
