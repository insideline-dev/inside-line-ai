import { Logger } from '@nestjs/common';
import { TaskJobData } from '../interfaces/job-data.interface';
import { TaskJobResult } from '../interfaces/job-result.interface';
import { BaseProcessor } from '../processors/base.processor';
import {
  mock,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
} from 'bun:test';

// Mock bullmq
mock.module('bullmq', () => ({
  Worker: mock(() => ({
    on: mock(() => ({})),
    close: mock(() => Promise.resolve()),
  })),
  Job: mock(() => ({})),
}));

const mockRedisClient: {
  quit: ReturnType<typeof mock>;
  disconnect: ReturnType<typeof mock>;
  duplicate: ReturnType<typeof mock>;
  status: string;
} = {
  quit: mock(() => Promise.resolve()),
  disconnect: mock(() => undefined),
  duplicate: mock(() => mockRedisClient),
  status: 'ready',
};

mock.module('ioredis', () => ({
  default: mock(() => mockRedisClient),
}));

import { Worker, Job } from 'bullmq';

// Test processor that mimics TaskProcessor behavior
class TestTaskProcessor extends BaseProcessor<TaskJobData, TaskJobResult> {
  protected readonly logger = new Logger(TestTaskProcessor.name);

  constructor() {
    super('task', { host: 'localhost', port: 6379 }, 5);
    this.initialize();
  }

  protected async process(
    job: Job<TaskJobData>,
  ): Promise<Omit<TaskJobResult, 'jobId' | 'duration' | 'success'>> {
    this.logger.log(
      `Processing task: ${job.data.name} for user ${job.data.userId}`,
    );

    // Simulate work without actual delay for faster tests
    this.logger.log(`Task ${job.data.name} completed`);

    return {
      type: 'task',
      result: {
        taskName: job.data.name,
        payload: job.data.payload,
        processedAt: new Date().toISOString(),
      },
    };
  }
}

describe('TaskProcessor', () => {
  let processor: TestTaskProcessor;

  beforeEach(() => {
    (Worker as any).mockClear();
    mockRedisClient.quit.mockClear();
    mockRedisClient.disconnect.mockClear();
    mockRedisClient.duplicate.mockClear();
    processor = new TestTaskProcessor();
  });

  afterEach(async () => {
    if (processor) {
      await processor.close();
    }
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should initialize worker', () => {
    expect(Worker).toHaveBeenCalledWith(
      'task',
      expect.any(Function),
      expect.objectContaining({
        concurrency: 5,
        connection: expect.any(Object),
      }),
    );
  });

  describe('process', () => {
    it('should process a task job successfully', async () => {
      const mockJob = {
        id: 'job_123',
        data: {
          type: 'task',
          userId: 'user_1',
          name: 'test-task',
          payload: { key: 'value' },
        } as TaskJobData,
      } as Job<TaskJobData>;

      const result = await (processor as any).processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.jobId).toBe('job_123');
      expect(result.type).toBe('task');
      expect(result.duration).toBeDefined();
      expect(result.result).toMatchObject({
        taskName: 'test-task',
        payload: { key: 'value' },
      });
      expect(result.result.processedAt).toBeDefined();
    });

    it('should log task processing', async () => {
      const loggerSpy = spyOn(
        (processor as any).logger,
        'log',
      ).mockImplementation(() => {});

      const mockJob = {
        id: 'job_456',
        data: {
          type: 'task',
          userId: 'user_2',
          name: 'another-task',
          payload: {},
        } as TaskJobData,
      } as Job<TaskJobData>;

      await (processor as any).processJob(mockJob);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Processing task: another-task for user user_2',
        ),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Task another-task completed'),
      );

      loggerSpy.mockRestore();
    });
  });
});
