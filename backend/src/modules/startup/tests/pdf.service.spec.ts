import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PdfService } from '../pdf.service';
import { DrizzleService } from '../../../database';
import { StartupStatus, StartupStage } from '../entities/startup.schema';
import { UserRole } from '../../../auth/entities/auth.schema';

describe('PdfService', () => {
  let service: PdfService;
  let drizzleService: jest.Mocked<DrizzleService>;

  const createMockDb = () => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
  });

  let mockDb: ReturnType<typeof createMockDb>;

  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
  const mockOtherUserId = '123e4567-e89b-12d3-a456-426614174099';
  const mockStartupId = '123e4567-e89b-12d3-a456-426614174001';

  const mockUser = {
    id: mockUserId,
    email: 'founder@test.com',
    name: 'Test Founder',
    role: UserRole.FOUNDER,
  };

  const mockAdminUser = {
    id: mockUserId,
    email: 'admin@test.com',
    name: 'Test Admin',
    role: UserRole.ADMIN,
  };

  const mockStartup = {
    id: mockStartupId,
    userId: mockUserId,
    name: 'Test Startup',
    slug: 'test-startup',
    tagline: 'A revolutionary product',
    description: 'This is a test startup description.',
    website: 'https://test.com',
    location: 'San Francisco, CA',
    normalizedRegion: 'us-west',
    industry: 'SaaS',
    stage: StartupStage.SEED,
    fundingTarget: 1000000,
    teamSize: 5,
    status: StartupStatus.APPROVED,
    pitchDeckUrl: null,
    demoUrl: null,
    logoUrl: null,
    submittedAt: new Date(),
    approvedAt: new Date(),
    rejectedAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAnalysisJob = {
    id: 'job-123',
    startupId: mockStartupId,
    jobType: 'scoring',
    status: 'completed',
    priority: 'medium',
    result: {
      overallScore: 75,
      teamScore: 80,
      marketScore: 70,
      productScore: 75,
      tractionScore: 65,
      financialScore: 72,
      highlights: ['Strong team', 'Growing market'],
      founders: [{ name: 'John Doe', title: 'CEO' }],
      marketSize: '$10B',
      targetMarket: 'Enterprise SaaS',
    },
    errorMessage: null,
    startedAt: new Date(),
    completedAt: new Date(),
    createdAt: new Date(),
  };

  beforeEach(() => {
    mockDb = createMockDb();
    drizzleService = {
      db: mockDb,
    } as unknown as jest.Mocked<DrizzleService>;
    service = new PdfService(drizzleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateMemo', () => {
    it('should generate memo PDF for startup owner', async () => {
      // Mock: user lookup, startup lookup, owner lookup, analysis lookup
      mockDb.limit
        .mockResolvedValueOnce([mockUser]) // requesting user
        .mockResolvedValueOnce([mockStartup]) // startup
        .mockResolvedValueOnce([mockUser]) // startup owner
        .mockResolvedValueOnce([mockAnalysisJob]); // analysis

      const result = await service.generateMemo(mockStartupId, mockUserId);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      // PDF magic bytes check
      expect(result.slice(0, 4).toString()).toBe('%PDF');
    });

    it('should generate memo PDF for admin', async () => {
      const adminOwnedStartup = { ...mockStartup, userId: mockOtherUserId };

      mockDb.limit
        .mockResolvedValueOnce([mockAdminUser]) // requesting admin
        .mockResolvedValueOnce([adminOwnedStartup]) // startup owned by someone else
        .mockResolvedValueOnce([{ email: 'other@test.com', name: 'Other' }]) // startup owner
        .mockResolvedValueOnce([mockAnalysisJob]); // analysis

      const result = await service.generateMemo(mockStartupId, mockUserId);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.slice(0, 4).toString()).toBe('%PDF');
    });

    it('should allow investor to view approved startup memo', async () => {
      const investorUser = {
        id: mockOtherUserId,
        email: 'investor@test.com',
        name: 'Test Investor',
        role: UserRole.INVESTOR,
      };

      const approvedStartup = { ...mockStartup, userId: mockUserId, status: StartupStatus.APPROVED };

      mockDb.limit
        .mockResolvedValueOnce([investorUser]) // requesting investor (not owner)
        .mockResolvedValueOnce([approvedStartup]) // approved startup
        .mockResolvedValueOnce([mockUser]) // startup owner
        .mockResolvedValueOnce([mockAnalysisJob]); // analysis

      const result = await service.generateMemo(mockStartupId, mockOtherUserId);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.generateMemo(mockStartupId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if startup not found', async () => {
      mockDb.limit
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([]);

      await expect(service.generateMemo(mockStartupId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user has no access to non-approved startup', async () => {
      const otherUser = { ...mockUser, id: mockOtherUserId };
      const draftStartup = { ...mockStartup, status: StartupStatus.DRAFT };

      mockDb.limit
        .mockResolvedValueOnce([otherUser]) // requesting user (not owner, not admin)
        .mockResolvedValueOnce([draftStartup]); // non-approved startup

      await expect(service.generateMemo(mockStartupId, mockOtherUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should generate PDF without analysis data gracefully', async () => {
      mockDb.limit
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([mockStartup])
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([]); // no analysis

      const result = await service.generateMemo(mockStartupId, mockUserId);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.slice(0, 4).toString()).toBe('%PDF');
    });
  });

  describe('generateReport', () => {
    it('should generate report PDF for startup owner', async () => {
      mockDb.limit
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([mockStartup])
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([mockAnalysisJob]);

      const result = await service.generateReport(mockStartupId, mockUserId);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      expect(result.slice(0, 4).toString()).toBe('%PDF');
    });

    it('should generate report PDF for admin regardless of ownership', async () => {
      const adminOwnedStartup = { ...mockStartup, userId: mockOtherUserId };

      mockDb.limit
        .mockResolvedValueOnce([mockAdminUser])
        .mockResolvedValueOnce([adminOwnedStartup])
        .mockResolvedValueOnce([{ email: 'other@test.com', name: 'Other' }])
        .mockResolvedValueOnce([mockAnalysisJob]);

      const result = await service.generateReport(mockStartupId, mockUserId);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should throw NotFoundException if startup not found', async () => {
      mockDb.limit
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([]);

      await expect(service.generateReport(mockStartupId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for non-owner on submitted startup', async () => {
      const otherUser = { ...mockUser, id: mockOtherUserId };
      const submittedStartup = { ...mockStartup, status: StartupStatus.SUBMITTED };

      mockDb.limit
        .mockResolvedValueOnce([otherUser])
        .mockResolvedValueOnce([submittedStartup]);

      await expect(service.generateReport(mockStartupId, mockOtherUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should include full analysis data in report', async () => {
      const fullAnalysis = {
        ...mockAnalysisJob,
        result: {
          ...mockAnalysisJob.result,
          teamAnalysis: 'Strong founding team with relevant experience.',
          marketAnalysis: 'Large addressable market with clear growth trends.',
          productAnalysis: 'Differentiated product with strong PMF signals.',
          tractionAnalysis: 'Solid growth metrics and user engagement.',
          financialAnalysis: 'Sustainable unit economics with path to profitability.',
          keyMetrics: ['100k MRR', '5000 active users', '20% MoM growth'],
          amountRaised: 500000,
        },
      };

      mockDb.limit
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([mockStartup])
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([fullAnalysis]);

      const result = await service.generateReport(mockStartupId, mockUserId);

      expect(result).toBeInstanceOf(Buffer);
      // Report should be larger due to more content
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate report without analysis gracefully', async () => {
      mockDb.limit
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([mockStartup])
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([]); // no analysis

      const result = await service.generateReport(mockStartupId, mockUserId);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.slice(0, 4).toString()).toBe('%PDF');
    });
  });

  describe('access control', () => {
    it('should allow owner to access their draft startup', async () => {
      const draftStartup = { ...mockStartup, status: StartupStatus.DRAFT };

      mockDb.limit
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([draftStartup])
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([]);

      const result = await service.generateMemo(mockStartupId, mockUserId);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should allow owner to access their submitted startup', async () => {
      const submittedStartup = { ...mockStartup, status: StartupStatus.SUBMITTED };

      mockDb.limit
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([submittedStartup])
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([]);

      const result = await service.generateMemo(mockStartupId, mockUserId);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should allow owner to access their rejected startup', async () => {
      const rejectedStartup = {
        ...mockStartup,
        status: StartupStatus.REJECTED,
        rejectionReason: 'Needs more traction',
      };

      mockDb.limit
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([rejectedStartup])
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([]);

      const result = await service.generateMemo(mockStartupId, mockUserId);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should allow admin to access any startup status', async () => {
      const draftStartup = { ...mockStartup, userId: mockOtherUserId, status: StartupStatus.DRAFT };

      mockDb.limit
        .mockResolvedValueOnce([mockAdminUser])
        .mockResolvedValueOnce([draftStartup])
        .mockResolvedValueOnce([{ email: 'other@test.com', name: 'Other' }])
        .mockResolvedValueOnce([]);

      const result = await service.generateMemo(mockStartupId, mockUserId);

      expect(result).toBeInstanceOf(Buffer);
    });
  });
});
