import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SubmissionService } from '../submission.service';
import { DrizzleService } from '../../../database';
import { NotificationService } from '../../../notification/notification.service';
import { ScoutApplicationStatus } from '../entities/scout.schema';
import { StartupStatus, StartupStage } from '../../startup/entities/startup.schema';

describe('SubmissionService', () => {
  let service: SubmissionService;
  let drizzleService: jest.Mocked<DrizzleService>;
  let notificationService: jest.Mocked<NotificationService>;

  const mockScoutId = '123e4567-e89b-12d3-a456-426614174000';
  const mockInvestorId = '123e4567-e89b-12d3-a456-426614174001';
  const mockStartupId = '123e4567-e89b-12d3-a456-426614174002';
  const mockSubmissionId = '123e4567-e89b-12d3-a456-426614174003';

  const mockApprovedScoutApp = {
    id: 'app-id',
    userId: mockScoutId,
    investorId: mockInvestorId,
    status: ScoutApplicationStatus.APPROVED,
  };

  const mockStartup = {
    id: mockStartupId,
    userId: mockScoutId,
    name: 'Test Startup',
    slug: 'test-startup',
    tagline: 'A test startup',
    description:
      'This is a test startup description that is long enough to pass validation requirements.',
    website: 'https://test.com',
    location: 'San Francisco',
    industry: 'SaaS',
    stage: StartupStage.SEED,
    fundingTarget: 1000000,
    teamSize: 5,
    status: StartupStatus.SUBMITTED,
    submittedAt: new Date(),
    createdAt: new Date(),
  };

  const mockSubmission = {
    id: mockSubmissionId,
    scoutId: mockScoutId,
    startupId: mockStartupId,
    investorId: mockInvestorId,
    commissionRate: 500,
    notes: 'Great team',
    createdAt: new Date(),
  };

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
    transaction: jest.fn(),
  });

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmissionService,
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
          },
        },
        {
          provide: NotificationService,
          useValue: {
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SubmissionService>(SubmissionService);
    drizzleService = module.get(DrizzleService);
    notificationService = module.get(NotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('submit', () => {
    const submitDto = {
      investorId: mockInvestorId,
      startupData: {
        name: 'Test Startup',
        tagline: 'A test startup',
        description:
          'This is a test startup description that is long enough to pass validation requirements.',
        website: 'https://test.com',
        location: 'San Francisco',
        industry: 'SaaS',
        stage: StartupStage.SEED,
        fundingTarget: 1000000,
        teamSize: 5,
      },
      notes: 'Great team',
    };

    it('should submit startup as approved scout', async () => {
      mockDb.limit.mockResolvedValueOnce([mockApprovedScoutApp]);

      const mockTx = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest
          .fn()
          .mockResolvedValueOnce([mockStartup])
          .mockResolvedValueOnce([mockSubmission]),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      const result = await service.submit(mockScoutId, submitDto);

      expect(result.startup).toEqual(mockStartup);
      expect(result.submission).toEqual(mockSubmission);
      expect(notificationService.create).toHaveBeenCalledWith(
        mockInvestorId,
        'New Scout Referral',
        expect.stringContaining('Test Startup'),
        expect.any(String),
        expect.stringContaining('/investor/submissions/'),
      );
    });

    it('should reject submission if scout not approved', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(service.submit(mockScoutId, submitDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject submission if targeting wrong investor', async () => {
      const wrongInvestorDto = {
        ...submitDto,
        investorId: 'wrong-investor-id',
      };

      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.submit(mockScoutId, wrongInvestorDto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('should return paginated submissions for scout', async () => {
      const query = { page: 1, limit: 10 };

      jest.spyOn(Promise, 'all').mockResolvedValueOnce([
        [mockSubmission],
        [{ count: 1 }],
      ] as any);

      const result = await service.findAll(mockScoutId, query);

      expect(result.data).toEqual([mockSubmission]);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should filter by investor', async () => {
      const query = { page: 1, limit: 10, investorId: mockInvestorId };

      jest.spyOn(Promise, 'all').mockResolvedValueOnce([
        [mockSubmission],
        [{ count: 1 }],
      ] as any);

      await service.findAll(mockScoutId, query);

      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('findAllForInvestor', () => {
    it('should return submissions for investor', async () => {
      const query = { page: 1, limit: 10 };

      jest.spyOn(Promise, 'all').mockResolvedValueOnce([
        [mockSubmission],
        [{ count: 1 }],
      ] as any);

      const result = await service.findAllForInvestor(mockInvestorId, query);

      expect(result.data).toEqual([mockSubmission]);
      expect(result.meta.total).toBe(1);
    });

    it('should handle pagination correctly', async () => {
      const query = { page: 2, limit: 5 };
      const submissions = Array(5).fill(mockSubmission);

      jest.spyOn(Promise, 'all').mockResolvedValueOnce([
        submissions,
        [{ count: 15 }],
      ] as any);

      const result = await service.findAllForInvestor(mockInvestorId, query);

      expect(result.meta).toEqual({
        total: 15,
        page: 2,
        limit: 5,
        totalPages: 3,
      });
    });
  });
});
