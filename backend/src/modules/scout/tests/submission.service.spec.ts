import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SubmissionService } from '../submission.service';
import { DrizzleService } from '../../../database';
import { NotificationService } from '../../../notification/notification.service';
import { StartupService } from '../../startup/startup.service';
import { ScoutApplicationStatus } from '../entities/scout.schema';
import { StartupStage } from '../../startup/entities/startup.schema';
import { UserRole } from '../../../auth/entities/auth.schema';

describe('SubmissionService', () => {
  let service: SubmissionService;
  let startupService: jest.Mocked<StartupService>;
  let notificationService: jest.Mocked<NotificationService>;

  const mockScoutId = '123e4567-e89b-12d3-a456-426614174000';
  const mockInvestorId = '123e4567-e89b-12d3-a456-426614174001';
  const mockStartupId = '123e4567-e89b-12d3-a456-426614174002';
  const mockSubmissionId = '123e4567-e89b-12d3-a456-426614174003';

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
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
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
        {
          provide: StartupService,
          useValue: {
            create: jest.fn(),
            submit: jest.fn(),
            findOne: jest.fn(),
            adminFindOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SubmissionService>(SubmissionService);
    startupService = module.get(StartupService);
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
          'This is a test startup description that is long enough to pass validation requirements and provide meaningful context.',
        website: 'https://test.com',
        location: 'San Francisco',
        industry: 'SaaS',
        stage: StartupStage.SEED,
        fundingTarget: 1000000,
        teamSize: 5,
      },
      notes: 'Great team',
    };

    it('submits through StartupService pipeline and records scout submission', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 'app-id',
          userId: mockScoutId,
          investorId: mockInvestorId,
          status: ScoutApplicationStatus.APPROVED,
        },
      ]);

      const createdStartup = { id: mockStartupId };
      const submittedStartup = { id: mockStartupId, status: 'submitted' };
      const submission = {
        id: mockSubmissionId,
        scoutId: mockScoutId,
        startupId: mockStartupId,
        investorId: mockInvestorId,
        commissionRate: 500,
        notes: 'Great team',
        createdAt: new Date(),
      };

      startupService.create.mockResolvedValue(createdStartup as any);
      mockDb.returning.mockResolvedValueOnce([submission]);
      startupService.submit.mockResolvedValue(submittedStartup as any);

      const result = await service.submit(mockScoutId, submitDto);

      expect(startupService.create).toHaveBeenCalledWith(
        mockScoutId,
        submitDto.startupData,
        UserRole.SCOUT,
        { scoutId: mockScoutId },
      );
      expect(startupService.submit).toHaveBeenCalledWith(
        mockStartupId,
        mockScoutId,
      );
      expect(notificationService.create).toHaveBeenCalled();
      expect(result.submission).toEqual(submission);
      expect(result.startup).toEqual(submittedStartup);
    });

    it('rejects submission when scout is not approved for target investor', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.submit(mockScoutId, submitDto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(startupService.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns paginated scout submissions', async () => {
      const query = { page: 1, limit: 10 };
      const items = [
        {
          id: mockStartupId,
          submissionId: mockSubmissionId,
          investorId: mockInvestorId,
          investorName: 'Investor',
          investorEmail: 'investor@example.com',
          commissionRate: 500,
          notes: null,
          name: 'Test Startup',
          tagline: 'Tagline',
          description: 'Description',
          website: 'https://test.com',
          location: 'SF',
          industry: 'SaaS',
          stage: 'seed',
          fundingTarget: 100000,
          teamSize: 4,
          status: 'submitted',
          overallScore: null,
          roundCurrency: 'USD',
          createdAt: new Date(),
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(Promise, 'all').mockResolvedValueOnce([
        items,
        [{ count: 1 }],
      ] as any);

      const result = await service.findAll(mockScoutId, query);

      expect(result.data).toEqual(items);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });
  });

  describe('getStartupDetail', () => {
    it('returns detail for scout-owned submission', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: mockSubmissionId,
          scoutId: mockScoutId,
          startupId: mockStartupId,
          investorId: mockInvestorId,
        },
      ]);
      startupService.findOne.mockResolvedValue({ id: mockStartupId } as any);

      const result = await service.getStartupDetail(mockScoutId, mockStartupId);

      expect(startupService.findOne).toHaveBeenCalledWith(
        mockStartupId,
        mockScoutId,
      );
      expect(result).toEqual({ id: mockStartupId });
    });

    it('throws when submission is not owned by scout', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.getStartupDetail(mockScoutId, mockStartupId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStartupMatches', () => {
    it('returns top startup matches for scout-owned submission', async () => {
      mockDb.limit
        .mockResolvedValueOnce([
          {
            id: mockSubmissionId,
            scoutId: mockScoutId,
            startupId: mockStartupId,
            investorId: mockInvestorId,
          },
        ])
        .mockResolvedValueOnce([
          {
            investorId: mockInvestorId,
            investorName: 'Investor',
            overallScore: 88,
            thesisFitScore: 91,
            fitRationale: 'Strong fit',
            status: 'new',
            createdAt: new Date(),
          },
        ]);

      const result = await service.getStartupMatches(
        mockScoutId,
        mockStartupId,
        3,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].overallScore).toBe(88);
    });
  });
});
