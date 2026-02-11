import { beforeEach, describe, expect, it, jest, mock } from 'bun:test';
import { ConfigService } from '@nestjs/config';
import type { Queue, QueueEvents } from 'bullmq';
import { QUEUE_NAMES } from '../queue.config';

// Mock BullMQ before importing QueueService
const mockQueue = {
  add: jest.fn(),
  getJob: jest.fn(),
  getJobCounts: jest.fn(),
  getJobs: jest.fn(),
  client: Promise.resolve({ ping: jest.fn().mockResolvedValue('PONG') }),
  close: jest.fn(),
};

const mockQueueEvents = {
  on: jest.fn(),
  off: jest.fn(),
  close: jest.fn(),
};

mock.module('bullmq', () => ({
  Queue: jest.fn(() => mockQueue),
  QueueEvents: jest.fn(() => mockQueueEvents),
}));

// Import after mocking
import { QueueService } from '../queue.service';

describe('QueueService', () => {
  let service: QueueService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    // Reset all mocks
    mockQueue.add.mockClear();
    mockQueue.getJob.mockClear();
    mockQueue.getJobCounts.mockClear();
    mockQueue.getJobs.mockClear();
    mockQueue.close.mockClear();
    mockQueueEvents.on.mockClear();
    mockQueueEvents.off.mockClear();
    mockQueueEvents.close.mockClear();

    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'REDIS_URL') return 'redis://localhost:6379';
        return defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new QueueService(configService);
  });

  describe('waitForJob', () => {
    it('should clean up listeners on timeout', async () => {
      const jobId = 'job-123';
      const timeoutMs = 100;

      const promise = service.waitForJob(QUEUE_NAMES.TASK, jobId, timeoutMs);

      await expect(promise).rejects.toThrow(`Job ${jobId} timed out after ${timeoutMs}ms`);

      expect(mockQueueEvents.off).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockQueueEvents.off).toHaveBeenCalledWith('failed', expect.any(Function));
    });

    it('should clean up listeners on success', async () => {
      const jobId = 'job-456';
      const returnValue = { success: true, data: 'test' };

      let completedHandler: any;
      mockQueueEvents.on.mockImplementation((event, handler) => {
        if (event === 'completed') {
          completedHandler = handler;
        }
        return mockQueueEvents as any;
      });

      const promise = service.waitForJob(QUEUE_NAMES.TASK, jobId, 5000);

      // Simulate job completion
      setTimeout(() => {
        completedHandler?.({ jobId, returnvalue: JSON.stringify(returnValue) });
      }, 10);

      const result = await promise;

      expect(result).toEqual(returnValue);
      expect(mockQueueEvents.off).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockQueueEvents.off).toHaveBeenCalledWith('failed', expect.any(Function));
    });

    it('should clean up listeners on failure', async () => {
      const jobId = 'job-789';
      const failureReason = 'Task execution failed';

      let failedHandler: any;
      mockQueueEvents.on.mockImplementation((event, handler) => {
        if (event === 'failed') {
          failedHandler = handler;
        }
        return mockQueueEvents as any;
      });

      const promise = service.waitForJob(QUEUE_NAMES.TASK, jobId, 5000);

      // Simulate job failure
      setTimeout(() => {
        failedHandler?.({ jobId, failedReason: failureReason });
      }, 10);

      await expect(promise).rejects.toThrow(failureReason);

      expect(mockQueueEvents.off).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockQueueEvents.off).toHaveBeenCalledWith('failed', expect.any(Function));
    });

    it('should handle double cleanup safely via cleaned flag', async () => {
      const jobId = 'job-cleanup';

      let completedHandler: any;
      let failedHandler: any;

      mockQueueEvents.on.mockImplementation((event, handler) => {
        if (event === 'completed') completedHandler = handler;
        if (event === 'failed') failedHandler = handler;
        return mockQueueEvents as any;
      });

      const promise = service.waitForJob(QUEUE_NAMES.TASK, jobId, 100);

      // Simulate simultaneous completion and timeout
      setTimeout(() => {
        completedHandler?.({ jobId, returnvalue: JSON.stringify({ data: 'test' }) });
        // Try to call handlers again after cleanup
        setTimeout(() => {
          failedHandler?.({ jobId, failedReason: 'Should not throw' });
        }, 20);
      }, 10);

      await promise;

      // Should only clean up once
      expect(mockQueueEvents.off).toHaveBeenCalledTimes(2); // completed + failed
    });

    it('should not clean up when wrong jobId completes', async () => {
      const targetJobId = 'job-target';
      const otherJobId = 'job-other';

      let completedHandler: any;
      mockQueueEvents.on.mockImplementation((event, handler) => {
        if (event === 'completed') {
          completedHandler = handler;
        }
        return mockQueueEvents as any;
      });

      const promise = service.waitForJob(QUEUE_NAMES.TASK, targetJobId, 200);

      // Complete a different job
      setTimeout(() => {
        completedHandler?.({ jobId: otherJobId, returnvalue: JSON.stringify({ data: 'wrong' }) });
      }, 10);

      // Complete the target job later
      setTimeout(() => {
        completedHandler?.({ jobId: targetJobId, returnvalue: JSON.stringify({ data: 'correct' }) });
      }, 50);

      const result = await promise;

      expect(result).toEqual({ data: 'correct' });
    });
  });

  describe('redisConnection', () => {
    it('should parse REDIS_URL correctly', () => {
      const testConfig = {
        get: jest.fn((key: string) => {
          if (key === 'REDIS_URL') return 'redis://user:pass@redis.example.com:6380';
          return undefined;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      const newService = new QueueService(testConfig);
      const connection = newService.redisConnection;

      expect(connection.host).toBe('redis.example.com');
      expect(connection.port).toBe(6380);
      expect(connection.username).toBe('user');
      expect(connection.password).toBe('pass');
    });

    it('should handle rediss:// protocol for TLS', () => {
      const testConfig = {
        get: jest.fn((key: string) => {
          if (key === 'REDIS_URL') return 'rediss://secure.redis.example.com:6379';
          return undefined;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      const newService = new QueueService(testConfig);
      const connection = newService.redisConnection;

      expect(connection.tls).toBeDefined();
    });
  });
});
