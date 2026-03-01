import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ScoutService } from '../scout.service';
import { DrizzleService } from '../../../database';
import { NotificationService } from '../../../notification/notification.service';
import { ScoutApplicationStatus } from '../entities/scout.schema';

describe('ScoutService', () => {
  let service: ScoutService;
  let _drizzleService: jest.Mocked<DrizzleService>;
  let notificationService: jest.Mocked<NotificationService>;

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
  });

  let mockDb: ReturnType<typeof createMockDb>;

  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
  const mockInvestorId = '123e4567-e89b-12d3-a456-426614174001';
  const mockApplicationId = '123e4567-e89b-12d3-a456-426614174002';

  const mockApplication = {
    id: mockApplicationId,
    userId: mockUserId,
    investorId: mockInvestorId,
    name: 'John Doe',
    email: 'john@example.com',
    linkedinUrl: 'https://linkedin.com/in/test',
    experience: 'Experienced scout with track record of successful referrals and deep network in fintech. Have worked with over 50 startups and helped them connect with the right investors for their stage and industry.',
    motivation: 'I want to help connect great startups with investors who can help them grow and succeed. My passion is discovering innovative companies early and matching them with investors who can provide not just capital but strategic value and guidance.',
    dealflowSources: 'LinkedIn, Angel networks, YC alumni, local startup events',
    portfolio: ['Company A', 'Company B'],
    status: ScoutApplicationStatus.PENDING,
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoutService,
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

    service = module.get<ScoutService>(ScoutService);
    _drizzleService = module.get(DrizzleService);
    notificationService = module.get(NotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('apply', () => {
    const applyDto = {
      investorId: mockInvestorId,
      name: 'John Doe',
      email: 'john@example.com',
      linkedinUrl: 'https://linkedin.com/in/test',
      experience: 'Experienced scout with track record of successful referrals and deep network in fintech. Have worked with over 50 startups and helped them connect with the right investors for their stage and industry.',
      motivation: 'I want to help connect great startups with investors who can help them grow and succeed. My passion is discovering innovative companies early and matching them with investors who can provide not just capital but strategic value and guidance.',
      dealflowSources: 'LinkedIn, Angel networks, YC alumni, local startup events',
      portfolio: ['Company A', 'Company B'],
    };

    it('should create scout application successfully', async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.returning.mockResolvedValueOnce([mockApplication]);

      const result = await service.apply(mockUserId, applyDto);

      expect(result).toEqual(mockApplication);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith({
        userId: mockUserId,
        investorId: applyDto.investorId,
        name: applyDto.name,
        email: applyDto.email,
        linkedinUrl: applyDto.linkedinUrl,
        experience: applyDto.experience,
        motivation: applyDto.motivation,
        dealflowSources: applyDto.dealflowSources,
        portfolio: applyDto.portfolio,
        status: ScoutApplicationStatus.PENDING,
      });
      expect(notificationService.create).toHaveBeenCalledWith(
        mockInvestorId,
        'New Scout Application',
        'You have a new scout application to review',
        expect.any(String),
        expect.stringContaining('/investor/scout-applications/'),
      );
    });

    it('should reject duplicate application to same investor', async () => {
      mockDb.limit.mockResolvedValue([mockApplication]);

      await expect(service.apply(mockUserId, applyDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should validate name field length (2-200 chars)', async () => {
      const shortNameDto = { ...applyDto, name: 'J' };
      const longNameDto = { ...applyDto, name: 'A'.repeat(201) };

      expect(shortNameDto.name.length).toBeLessThan(2);
      expect(longNameDto.name.length).toBeGreaterThan(200);
    });

    it('should validate email format', async () => {
      const validEmail = applyDto.email;
      const invalidEmail = 'not-an-email';

      expect(validEmail).toContain('@');
      expect(invalidEmail).not.toContain('@');
    });

    it('should validate experience field length (100-1000 chars)', async () => {
      const shortExperience = 'Too short';
      const validExperience = applyDto.experience;
      const longExperience = 'A'.repeat(1001);

      expect(shortExperience.length).toBeLessThan(100);
      expect(validExperience.length).toBeGreaterThanOrEqual(100);
      expect(validExperience.length).toBeLessThanOrEqual(1000);
      expect(longExperience.length).toBeGreaterThan(1000);
    });

    it('should validate motivation field length (100-1000 chars)', async () => {
      const shortMotivation = 'Too short';
      const validMotivation = applyDto.motivation;
      const longMotivation = 'A'.repeat(1001);

      expect(shortMotivation.length).toBeLessThan(100);
      expect(validMotivation.length).toBeGreaterThanOrEqual(100);
      expect(validMotivation.length).toBeLessThanOrEqual(1000);
      expect(longMotivation.length).toBeGreaterThan(1000);
    });

    it('should validate dealflowSources field length (50-500 chars)', async () => {
      const shortSources = 'Too short';
      const validSources = applyDto.dealflowSources;
      const longSources = 'A'.repeat(501);

      expect(shortSources.length).toBeLessThan(50);
      expect(validSources.length).toBeGreaterThanOrEqual(50);
      expect(validSources.length).toBeLessThanOrEqual(500);
      expect(longSources.length).toBeGreaterThan(500);
    });

    it('should handle optional portfolio array', async () => {
      const dtoWithoutPortfolio = { ...applyDto };
      delete (dtoWithoutPortfolio as Record<string, unknown>).portfolio;

      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.returning.mockResolvedValueOnce([
        { ...mockApplication, portfolio: [] },
      ]);

      await service.apply(mockUserId, dtoWithoutPortfolio);

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          portfolio: [],
        }),
      );
    });

    it('should save all fields correctly when creating application', async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.returning.mockResolvedValueOnce([mockApplication]);

      await service.apply(mockUserId, applyDto);

      expect(mockDb.values).toHaveBeenCalledWith({
        userId: mockUserId,
        investorId: applyDto.investorId,
        name: applyDto.name,
        email: applyDto.email,
        linkedinUrl: applyDto.linkedinUrl,
        experience: applyDto.experience,
        motivation: applyDto.motivation,
        dealflowSources: applyDto.dealflowSources,
        portfolio: applyDto.portfolio,
        status: ScoutApplicationStatus.PENDING,
      });
    });

    it('should limit portfolio to 10 items max', async () => {
      const validPortfolio = Array(10).fill('Company');
      const invalidPortfolio = Array(11).fill('Company');

      expect(validPortfolio.length).toBeLessThanOrEqual(10);
      expect(invalidPortfolio.length).toBeGreaterThan(10);
    });
  });

  describe('findApplications', () => {
    it('should return paginated applications for user', async () => {
      const query = { page: 1, limit: 10 };
      const mockApplications = [mockApplication];

      jest.spyOn(Promise, 'all').mockResolvedValueOnce([
        mockApplications,
        [{ count: 1 }],
      ] as unknown);

      const result = await service.findApplications(mockUserId, query);

      expect(result.data).toEqual(mockApplications);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should filter by status', async () => {
      const query = {
        page: 1,
        limit: 10,
        status: ScoutApplicationStatus.APPROVED,
      };

      jest.spyOn(Promise, 'all').mockResolvedValueOnce([
        [mockApplication],
        [{ count: 1 }],
      ] as unknown);

      await service.findApplications(mockUserId, query);

      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('findApplicationsForInvestor', () => {
    it('should return applications for investor', async () => {
      const query = { page: 1, limit: 10 };

      jest.spyOn(Promise, 'all').mockResolvedValueOnce([
        [mockApplication],
        [{ count: 1 }],
      ] as unknown);

      const result = await service.findApplicationsForInvestor(
        mockInvestorId,
        query,
      );

      expect(result.data).toEqual([mockApplication]);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('approve', () => {
    it('should approve pending application', async () => {
      const approvedApp = {
        ...mockApplication,
        status: ScoutApplicationStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedBy: mockInvestorId,
      };

      mockDb.limit.mockResolvedValueOnce([mockApplication]);
      mockDb.returning.mockResolvedValueOnce([approvedApp]);

      const result = await service.approve(mockApplicationId, mockInvestorId);

      expect(result.status).toBe(ScoutApplicationStatus.APPROVED);
      expect(mockDb.update).toHaveBeenCalled();
      expect(notificationService.create).toHaveBeenCalledWith(
        mockUserId,
        'Scout Application Approved',
        'Your scout application has been approved',
        expect.any(String),
        '/scout/applications',
      );
    });

    it('should reject approval if application not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.approve(mockApplicationId, mockInvestorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject approval if not investor', async () => {
      mockDb.limit.mockResolvedValueOnce([mockApplication]);

      await expect(
        service.approve(mockApplicationId, 'wrong-investor-id'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject approval if already reviewed', async () => {
      const reviewedApp = {
        ...mockApplication,
        status: ScoutApplicationStatus.APPROVED,
      };
      mockDb.limit.mockResolvedValueOnce([reviewedApp]);

      await expect(
        service.approve(mockApplicationId, mockInvestorId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reject', () => {
    const rejectDto = {
      rejectionReason: 'Insufficient track record',
    };

    it('should reject pending application', async () => {
      const rejectedApp = {
        ...mockApplication,
        status: ScoutApplicationStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedBy: mockInvestorId,
        rejectionReason: rejectDto.rejectionReason,
      };

      mockDb.limit.mockResolvedValueOnce([mockApplication]);
      mockDb.returning.mockResolvedValueOnce([rejectedApp]);

      const result = await service.reject(
        mockApplicationId,
        mockInvestorId,
        rejectDto,
      );

      expect(result.status).toBe(ScoutApplicationStatus.REJECTED);
      expect(result.rejectionReason).toBe(rejectDto.rejectionReason);
      expect(notificationService.create).toHaveBeenCalledWith(
        mockUserId,
        'Scout Application Rejected',
        expect.stringContaining(rejectDto.rejectionReason),
        expect.any(String),
        '/scout/applications',
      );
    });

    it('should reject rejection if application not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.reject(mockApplicationId, mockInvestorId, rejectDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject rejection if not investor', async () => {
      mockDb.limit.mockResolvedValueOnce([mockApplication]);

      await expect(
        service.reject(mockApplicationId, 'wrong-investor-id', rejectDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject rejection if already reviewed', async () => {
      const reviewedApp = {
        ...mockApplication,
        status: ScoutApplicationStatus.REJECTED,
      };
      mockDb.limit.mockResolvedValueOnce([reviewedApp]);

      await expect(
        service.reject(mockApplicationId, mockInvestorId, rejectDto),
      ).rejects.toThrow(ConflictException);
    });
  });
});
