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
  let drizzleService: jest.Mocked<DrizzleService>;
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
    bio: 'Experienced scout with track record',
    linkedinUrl: 'https://linkedin.com/in/test',
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
    drizzleService = module.get(DrizzleService);
    notificationService = module.get(NotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('apply', () => {
    const applyDto = {
      investorId: mockInvestorId,
      bio: 'Experienced scout with track record of successful referrals',
      linkedinUrl: 'https://linkedin.com/in/test',
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
        bio: applyDto.bio,
        linkedinUrl: applyDto.linkedinUrl,
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
  });

  describe('findApplications', () => {
    it('should return paginated applications for user', async () => {
      const query = { page: 1, limit: 10 };
      const mockApplications = [mockApplication];

      jest.spyOn(Promise, 'all').mockResolvedValueOnce([
        mockApplications,
        [{ count: 1 }],
      ] as any);

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
      ] as any);

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
      ] as any);

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
