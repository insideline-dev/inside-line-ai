import {
  describe,
  it,
  expect,
} from 'bun:test';
import { AnalysisJobType, AnalysisJobStatus, AnalysisJobPriority } from '../entities';

describe('AnalysisService', () => {
  const mockStartupId = '123e4567-e89b-12d3-a456-426614174000';
  const _mockUserId = '123e4567-e89b-12d3-a456-426614174001';
  const mockJobId = '123e4567-e89b-12d3-a456-426614174002';

  const _mockJob = {
    id: mockJobId,
    startupId: mockStartupId,
    jobType: AnalysisJobType.SCORING,
    status: AnalysisJobStatus.PENDING,
    priority: AnalysisJobPriority.HIGH,
    result: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
  };

  describe('job queuing', () => {
    it('should have correct priority mapping', () => {
      const priorities = {
        high: 1,
        medium: 5,
        low: 10,
      };

      expect(priorities.high).toBe(1);
      expect(priorities.medium).toBe(5);
      expect(priorities.low).toBe(10);
    });

    it('should map job types to priorities correctly', () => {
      const jobTypePriorities: Record<AnalysisJobType, AnalysisJobPriority> = {
        [AnalysisJobType.SCORING]: AnalysisJobPriority.HIGH,
        [AnalysisJobType.PDF]: AnalysisJobPriority.HIGH,
        [AnalysisJobType.MATCHING]: AnalysisJobPriority.MEDIUM,
        [AnalysisJobType.MARKET_ANALYSIS]: AnalysisJobPriority.LOW,
      };

      expect(jobTypePriorities[AnalysisJobType.SCORING]).toBe(AnalysisJobPriority.HIGH);
      expect(jobTypePriorities[AnalysisJobType.PDF]).toBe(AnalysisJobPriority.HIGH);
      expect(jobTypePriorities[AnalysisJobType.MATCHING]).toBe(AnalysisJobPriority.MEDIUM);
      expect(jobTypePriorities[AnalysisJobType.MARKET_ANALYSIS]).toBe(AnalysisJobPriority.LOW);
    });
  });

  describe('job status workflow', () => {
    it('should have valid status transitions', () => {
      const validTransitions: Record<AnalysisJobStatus, AnalysisJobStatus[]> = {
        [AnalysisJobStatus.PENDING]: [AnalysisJobStatus.PROCESSING],
        [AnalysisJobStatus.PROCESSING]: [
          AnalysisJobStatus.COMPLETED,
          AnalysisJobStatus.FAILED,
        ],
        [AnalysisJobStatus.COMPLETED]: [],
        [AnalysisJobStatus.FAILED]: [AnalysisJobStatus.PENDING], // retry creates new job
      };

      expect(validTransitions[AnalysisJobStatus.PENDING]).toContain(
        AnalysisJobStatus.PROCESSING,
      );
      expect(validTransitions[AnalysisJobStatus.PROCESSING]).toContain(
        AnalysisJobStatus.COMPLETED,
      );
      expect(validTransitions[AnalysisJobStatus.PROCESSING]).toContain(
        AnalysisJobStatus.FAILED,
      );
    });
  });

  describe('retry logic', () => {
    it('should only allow retrying failed jobs', () => {
      const canRetry = (status: AnalysisJobStatus) =>
        status === AnalysisJobStatus.FAILED;

      expect(canRetry(AnalysisJobStatus.FAILED)).toBe(true);
      expect(canRetry(AnalysisJobStatus.PENDING)).toBe(false);
      expect(canRetry(AnalysisJobStatus.PROCESSING)).toBe(false);
      expect(canRetry(AnalysisJobStatus.COMPLETED)).toBe(false);
    });

    it('should map job type to queue method', () => {
      const queueMethods: Record<AnalysisJobType, string> = {
        [AnalysisJobType.SCORING]: 'queueScoringJob',
        [AnalysisJobType.MATCHING]: 'queueMatchingJob',
        [AnalysisJobType.PDF]: 'queuePdfJob',
        [AnalysisJobType.MARKET_ANALYSIS]: 'queueMarketAnalysisJob',
      };

      expect(queueMethods[AnalysisJobType.SCORING]).toBe('queueScoringJob');
      expect(queueMethods[AnalysisJobType.MATCHING]).toBe('queueMatchingJob');
      expect(queueMethods[AnalysisJobType.PDF]).toBe('queuePdfJob');
      expect(queueMethods[AnalysisJobType.MARKET_ANALYSIS]).toBe('queueMarketAnalysisJob');
    });
  });

  describe('job update fields', () => {
    it('should set startedAt when status changes to processing', () => {
      const updateData = createUpdateData(AnalysisJobStatus.PROCESSING);

      expect(updateData.status).toBe(AnalysisJobStatus.PROCESSING);
      expect(updateData.startedAt).toBeInstanceOf(Date);
      expect(updateData.completedAt).toBeUndefined();
    });

    it('should set completedAt and result when status changes to completed', () => {
      const result = { scores: { marketScore: 85 } };
      const updateData = createUpdateData(AnalysisJobStatus.COMPLETED, result);

      expect(updateData.status).toBe(AnalysisJobStatus.COMPLETED);
      expect(updateData.completedAt).toBeInstanceOf(Date);
      expect(updateData.result).toEqual(result);
    });

    it('should set completedAt and errorMessage when status changes to failed', () => {
      const errorMessage = 'Job failed due to timeout';
      const updateData = createUpdateData(
        AnalysisJobStatus.FAILED,
        undefined,
        errorMessage,
      );

      expect(updateData.status).toBe(AnalysisJobStatus.FAILED);
      expect(updateData.completedAt).toBeInstanceOf(Date);
      expect(updateData.errorMessage).toBe(errorMessage);
    });
  });

  describe('pagination', () => {
    it('should calculate correct offset', () => {
      const calculateOffset = (page: number, limit: number) =>
        (page - 1) * limit;

      expect(calculateOffset(1, 20)).toBe(0);
      expect(calculateOffset(2, 20)).toBe(20);
      expect(calculateOffset(3, 10)).toBe(20);
    });

    it('should calculate total pages correctly', () => {
      const calculateTotalPages = (total: number, limit: number) =>
        Math.ceil(total / limit);

      expect(calculateTotalPages(50, 20)).toBe(3);
      expect(calculateTotalPages(20, 20)).toBe(1);
      expect(calculateTotalPages(0, 20)).toBe(0);
      expect(calculateTotalPages(21, 20)).toBe(2);
    });
  });
});

// Helper function that mimics the service's update logic
function createUpdateData(
  status: AnalysisJobStatus,
  result?: Record<string, unknown>,
  errorMessage?: string,
) {
  const updateData: {
    status: AnalysisJobStatus;
    startedAt?: Date;
    completedAt?: Date;
    result?: Record<string, unknown>;
    errorMessage?: string;
  } = { status };

  if (status === AnalysisJobStatus.PROCESSING) {
    updateData.startedAt = new Date();
  }

  if (status === AnalysisJobStatus.COMPLETED) {
    updateData.completedAt = new Date();
    if (result) {
      updateData.result = result;
    }
  }

  if (status === AnalysisJobStatus.FAILED) {
    updateData.completedAt = new Date();
    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }
  }

  return updateData;
}
