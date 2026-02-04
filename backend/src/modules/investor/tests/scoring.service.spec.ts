import { Test, TestingModule } from '@nestjs/testing';
import { ScoringService } from '../scoring.service';
import { DrizzleService } from '../../../database';

describe('ScoringService', () => {
  let service: ScoringService;
  let drizzleService: jest.Mocked<DrizzleService>;

  const createMockDb = () => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  });

  let mockDb: ReturnType<typeof createMockDb>;

  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';

  const mockWeights = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    userId: mockUserId,
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
        ScoringService,
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
            withRLS: jest.fn((userId, callback) => callback(mockDb)),
          },
        },
      ],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
    drizzleService = module.get(DrizzleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('should return weights when found', async () => {
      mockDb.limit.mockResolvedValue([mockWeights]);

      const result = await service.findOne(mockUserId);

      expect(result).toEqual(mockWeights);
      expect(drizzleService.withRLS).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function),
      );
    });

    it('should return default weights when not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await service.findOne(mockUserId);

      expect(result).toEqual({
        id: '',
        userId: mockUserId,
        marketWeight: 20,
        teamWeight: 20,
        productWeight: 20,
        tractionWeight: 20,
        financialsWeight: 20,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('update', () => {
    const updateDto = {
      marketWeight: 30,
      teamWeight: 25,
      productWeight: 20,
      tractionWeight: 15,
      financialsWeight: 10,
    };

    it('should create weights when none exist', async () => {
      mockDb.limit.mockResolvedValue([]);
      mockDb.returning.mockResolvedValue([mockWeights]);

      const result = await service.update(mockUserId, updateDto);

      expect(result).toEqual(mockWeights);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith({
        userId: mockUserId,
        ...updateDto,
      });
    });

    it('should update weights when they exist', async () => {
      mockDb.limit.mockResolvedValue([mockWeights]);
      mockDb.returning.mockResolvedValue([{ ...mockWeights, ...updateDto }]);

      const result = await service.update(mockUserId, updateDto);

      expect(result).toBeDefined();
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining(updateDto),
      );
    });
  });

  describe('getDefaults', () => {
    it('should return default weights', () => {
      const defaults = service.getDefaults();

      expect(defaults).toEqual({
        marketWeight: 20,
        teamWeight: 20,
        productWeight: 20,
        tractionWeight: 20,
        financialsWeight: 20,
      });
    });
  });
});
