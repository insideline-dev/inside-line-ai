import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MatchService } from '../match.service';
import { ScoringService } from '../scoring.service';
import { DrizzleService } from '../../../database';
import { QueueService } from '../../../queue';

describe('MatchService', () => {
  let service: MatchService;
  let drizzleService: jest.Mocked<DrizzleService>;
  let queueService: jest.Mocked<QueueService>;
  let scoringService: jest.Mocked<ScoringService>;

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

  const mockInvestorId = '123e4567-e89b-12d3-a456-426614174000';
  const mockStartupId = '123e4567-e89b-12d3-a456-426614174001';

  const mockMatch = {
    id: '123e4567-e89b-12d3-a456-426614174002',
    investorId: mockInvestorId,
    startupId: mockStartupId,
    overallScore: 85,
    marketScore: 90,
    teamScore: 85,
    productScore: 80,
    tractionScore: 75,
    financialsScore: 85,
    matchReason: 'Strong market fit and experienced team',
    isSaved: false,
    viewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockWeights = {
    id: '123e4567-e89b-12d3-a456-426614174003',
    userId: mockInvestorId,
    marketWeight: 30,
    teamWeight: 25,
    productWeight: 20,
    tractionWeight: 15,
    financialsWeight: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchService,
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
            withRLS: jest.fn((userId, callback) => callback(mockDb)),
          },
        },
        {
          provide: QueueService,
          useValue: {
            addJob: jest.fn(),
          },
        },
        {
          provide: ScoringService,
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockWeights),
          },
        },
      ],
    }).compile();

    service = module.get<MatchService>(MatchService);
    drizzleService = module.get(DrizzleService);
    queueService = module.get(QueueService);
    scoringService = module.get(ScoringService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    beforeEach(() => {
      // Reset all mocks to ensure proper chaining
      jest.clearAllMocks();
    });

    it('should return paginated matches sorted by score DESC', async () => {
      const mockMatches = [mockMatch];
      // First query chain ends with offset
      mockDb.offset.mockResolvedValueOnce(mockMatches);
      // Second query chain ends with where (for count)
      // We need where to return this for the first chain, and resolved value for second
      let whereCallCount = 0;
      mockDb.where.mockImplementation(() => {
        whereCallCount++;
        if (whereCallCount === 1) {
          return mockDb; // First where call returns mockDb to continue chain
        }
        return Promise.resolve([{ count: 1 }]); // Second where call for count query
      });

      const result = await service.findAll(mockInvestorId, {
        page: 1,
        limit: 20,
      });

      expect(result.data).toEqual(mockMatches);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('should filter by minScore', async () => {
      mockDb.offset.mockResolvedValueOnce([mockMatch]);
      let whereCallCount = 0;
      mockDb.where.mockImplementation(() => {
        whereCallCount++;
        if (whereCallCount === 1) {
          return mockDb;
        }
        return Promise.resolve([{ count: 1 }]);
      });

      await service.findAll(mockInvestorId, {
        page: 1,
        limit: 20,
        minScore: 80,
      });

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should filter by isSaved', async () => {
      mockDb.offset.mockResolvedValueOnce([{ ...mockMatch, isSaved: true }]);
      let whereCallCount = 0;
      mockDb.where.mockImplementation(() => {
        whereCallCount++;
        if (whereCallCount === 1) {
          return mockDb;
        }
        return Promise.resolve([{ count: 1 }]);
      });

      const result = await service.findAll(mockInvestorId, {
        page: 1,
        limit: 20,
        isSaved: true,
      });

      expect(result.data[0].isSaved).toBe(true);
    });
  });

  describe('findOne', () => {
    it('should return match when found', async () => {
      mockDb.limit.mockResolvedValue([mockMatch]);

      const result = await service.findOne(mockInvestorId, mockStartupId);

      expect(result).toEqual(mockMatch);
    });

    it('should throw NotFoundException when match not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(
        service.findOne(mockInvestorId, mockStartupId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleSaved', () => {
    it('should toggle saved status from false to true', async () => {
      mockDb.limit.mockResolvedValue([mockMatch]);
      mockDb.returning.mockResolvedValue([{ ...mockMatch, isSaved: true }]);

      const result = await service.toggleSaved(mockInvestorId, mockStartupId);

      expect(result.isSaved).toBe(true);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should toggle saved status from true to false', async () => {
      mockDb.limit.mockResolvedValue([{ ...mockMatch, isSaved: true }]);
      mockDb.returning.mockResolvedValue([{ ...mockMatch, isSaved: false }]);

      const result = await service.toggleSaved(mockInvestorId, mockStartupId);

      expect(result.isSaved).toBe(false);
    });
  });

  describe('updateViewedAt', () => {
    it('should update viewed timestamp', async () => {
      const now = new Date();
      mockDb.returning.mockResolvedValue([{ ...mockMatch, viewedAt: now }]);

      const result = await service.updateViewedAt(
        mockInvestorId,
        mockStartupId,
      );

      expect(result.viewedAt).toEqual(now);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('calculateOverallScore', () => {
    it('should calculate weighted average correctly', () => {
      const match = {
        marketScore: 90,
        teamScore: 85,
        productScore: 80,
        tractionScore: 75,
        financialsScore: 85,
      };

      const weights = {
        marketWeight: 30,
        teamWeight: 25,
        productWeight: 20,
        tractionWeight: 15,
        financialsWeight: 10,
      };

      const result = service.calculateOverallScore(match, weights);

      // (90*30 + 85*25 + 80*20 + 75*15 + 85*10) / 100 = 83.75 -> 84
      expect(result).toBe(84);
    });

    it('should handle null scores as 0', () => {
      const match = {
        marketScore: 90,
        teamScore: null,
        productScore: null,
        tractionScore: null,
        financialsScore: null,
      };

      const weights = {
        marketWeight: 30,
        teamWeight: 25,
        productWeight: 20,
        tractionWeight: 15,
        financialsWeight: 10,
      };

      const result = service.calculateOverallScore(match, weights);

      // (90*30 + 0*25 + 0*20 + 0*15 + 0*10) / 100 = 27
      expect(result).toBe(27);
    });

    it('should calculate with equal weights (defaults)', () => {
      const match = {
        marketScore: 80,
        teamScore: 80,
        productScore: 80,
        tractionScore: 80,
        financialsScore: 80,
      };

      const weights = {
        marketWeight: 20,
        teamWeight: 20,
        productWeight: 20,
        tractionWeight: 20,
        financialsWeight: 20,
      };

      const result = service.calculateOverallScore(match, weights);

      expect(result).toBe(80);
    });
  });

  describe('regenerateMatches', () => {
    it('should queue regeneration job', async () => {
      await service.regenerateMatches(mockInvestorId);

      expect(queueService.addJob).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'task',
          userId: mockInvestorId,
          name: 'regenerate-matches',
          payload: { investorId: mockInvestorId },
        }),
        expect.any(Object),
      );
    });
  });

  describe('createOrUpdate', () => {
    const scores = {
      marketScore: 90,
      teamScore: 85,
      productScore: 80,
      tractionScore: 75,
      financialsScore: 85,
      matchReason: 'Test match',
    };

    it('should create new match when none exists', async () => {
      mockDb.limit.mockResolvedValue([]);
      mockDb.returning.mockResolvedValue([mockMatch]);

      const result = await service.createOrUpdate(
        mockInvestorId,
        mockStartupId,
        scores,
      );

      expect(result).toEqual(mockMatch);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(scoringService.findOne).toHaveBeenCalledWith(mockInvestorId);
    });

    it('should update existing match', async () => {
      mockDb.limit.mockResolvedValue([mockMatch]);
      mockDb.returning.mockResolvedValue([{ ...mockMatch, ...scores }]);

      const result = await service.createOrUpdate(
        mockInvestorId,
        mockStartupId,
        scores,
      );

      expect(result).toBeDefined();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should calculate overall score using investor weights', async () => {
      mockDb.limit.mockResolvedValue([]);
      mockDb.returning.mockResolvedValue([mockMatch]);

      await service.createOrUpdate(mockInvestorId, mockStartupId, scores);

      expect(scoringService.findOne).toHaveBeenCalledWith(mockInvestorId);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          overallScore: expect.any(Number),
        }),
      );
    });
  });
});
