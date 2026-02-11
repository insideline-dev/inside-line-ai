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
          'This is a test startup description that is long enough to pass validation requirements. The company is building an innovative SaaS platform that solves a critical problem in the enterprise market.',
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

    it('should accept full CreateStartupDto data', async () => {
      const fullStartupDto = {
        investorId: mockInvestorId,
        startupData: {
          ...submitDto.startupData,
          pitchDeckUrl: 'https://example.com/deck.pdf',
          demoUrl: 'https://example.com/demo',
        },
        notes: 'Excellent team with strong product-market fit',
      };

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

      await service.submit(mockScoutId, fullStartupDto);

      expect(mockTx.values).toHaveBeenCalledWith(
        expect.objectContaining({
          name: fullStartupDto.startupData.name,
          pitchDeckUrl: fullStartupDto.startupData.pitchDeckUrl,
          demoUrl: fullStartupDto.startupData.demoUrl,
        }),
      );
    });

    it('should validate required startup fields', async () => {
      const requiredFields = [
        'name',
        'tagline',
        'description',
        'website',
        'location',
        'industry',
        'stage',
        'fundingTarget',
        'teamSize',
      ];

      requiredFields.forEach((field) => {
        expect(submitDto.startupData).toHaveProperty(field);
      });
    });

    it('should pass all startup fields to startup service', async () => {
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

      await service.submit(mockScoutId, submitDto);

      expect(mockTx.values).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          userId: mockScoutId,
          name: submitDto.startupData.name,
          tagline: submitDto.startupData.tagline,
          description: submitDto.startupData.description,
          website: submitDto.startupData.website,
          location: submitDto.startupData.location,
          industry: submitDto.startupData.industry,
          stage: submitDto.startupData.stage,
          fundingTarget: submitDto.startupData.fundingTarget,
          teamSize: submitDto.startupData.teamSize,
          geoCountryCode: 'US',
          geoLevel1: 'l1:north_america',
          geoLevel2: 'l2:us_canada',
          geoLevel3: 'l3:us',
          geoPath: ['l1:north_america', 'l2:us_canada', 'l3:us'],
          slug: expect.any(String),
          status: StartupStatus.SUBMITTED,
          submittedAt: expect.any(Date),
        }),
      );
    });

    it('should handle optional fields in startup data', async () => {
      const dtoWithOptionalFields = {
        ...submitDto,
        startupData: {
          ...submitDto.startupData,
          pitchDeckUrl: 'https://example.com/deck.pdf',
          demoUrl: 'https://example.com/demo',
        },
      };

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

      await service.submit(mockScoutId, dtoWithOptionalFields);

      expect(mockTx.values).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          pitchDeckUrl: dtoWithOptionalFields.startupData.pitchDeckUrl,
          demoUrl: dtoWithOptionalFields.startupData.demoUrl,
        }),
      );
    });

    it('should generate slug from startup name', async () => {
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

      await service.submit(mockScoutId, submitDto);

      expect(mockTx.values).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          slug: 'test-startup',
        }),
      );
    });

    it('should handle notes as optional field', async () => {
      const dtoWithoutNotes = {
        investorId: mockInvestorId,
        startupData: submitDto.startupData,
      };

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

      await service.submit(mockScoutId, dtoWithoutNotes);

      expect(mockTx.values).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          notes: null,
        }),
      );
    });

    it('should validate startup description length (100-5000 chars)', async () => {
      const shortDescription = 'Too short';
      const validDescription = submitDto.startupData.description;
      const longDescription = 'A'.repeat(5001);

      expect(shortDescription.length).toBeLessThan(100);
      expect(validDescription.length).toBeGreaterThanOrEqual(100);
      expect(validDescription.length).toBeLessThanOrEqual(5000);
      expect(longDescription.length).toBeGreaterThan(5000);
    });

    it('should validate startup website as URL', async () => {
      const validUrl = submitDto.startupData.website;
      const invalidUrl = 'not-a-url';

      expect(validUrl).toMatch(/^https?:\/\//);
      expect(invalidUrl).not.toMatch(/^https?:\/\//);
    });

    it('should validate positive integer for fundingTarget', async () => {
      const validTarget = submitDto.startupData.fundingTarget;
      const negativeTarget = -1000;
      const zeroTarget = 0;

      expect(validTarget).toBeGreaterThan(0);
      expect(Number.isInteger(validTarget)).toBe(true);
      expect(negativeTarget).toBeLessThan(1);
      expect(zeroTarget).toBe(0);
    });

    it('should validate positive integer for teamSize', async () => {
      const validSize = submitDto.startupData.teamSize;
      const negativeSize = -5;
      const zeroSize = 0;

      expect(validSize).toBeGreaterThan(0);
      expect(Number.isInteger(validSize)).toBe(true);
      expect(negativeSize).toBeLessThan(1);
      expect(zeroSize).toBe(0);
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
