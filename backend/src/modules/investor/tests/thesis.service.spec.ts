import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ThesisService } from '../thesis.service';
import { DrizzleService } from '../../../database';

describe('ThesisService', () => {
  let service: ThesisService;
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
    delete: jest.fn().mockReturnThis(),
  });

  let mockDb: ReturnType<typeof createMockDb>;

  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';

  const mockThesis = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    userId: mockUserId,
    industries: ['fintech', 'healthtech'],
    stages: ['seed', 'series-a'],
    checkSizeMin: 100000,
    checkSizeMax: 1000000,
    geographicFocus: ['North America', 'Europe'],
    mustHaveFeatures: ['AI/ML', 'SaaS'],
    dealBreakers: ['crypto', 'gambling'],
    notes: 'Looking for B2B SaaS with strong fundamentals',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThesisService,
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
            withRLS: jest.fn((userId, callback) => callback(mockDb)),
          },
        },
      ],
    }).compile();

    service = module.get<ThesisService>(ThesisService);
    drizzleService = module.get(DrizzleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('should return thesis when found', async () => {
      mockDb.limit.mockResolvedValue([mockThesis]);

      const result = await service.findOne(mockUserId);

      expect(result).toEqual(mockThesis);
      expect(drizzleService.withRLS).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function),
      );
    });

    it('should return null when thesis not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await service.findOne(mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    const createDto = {
      industries: ['fintech'],
      stages: ['seed'],
      checkSizeMin: 100000,
      checkSizeMax: 500000,
      geographicFocus: ['North America'],
      mustHaveFeatures: ['AI/ML'],
      dealBreakers: ['crypto'],
      notes: 'Test thesis',
    };

    it('should create thesis when none exists', async () => {
      mockDb.limit.mockResolvedValue([]);
      mockDb.returning.mockResolvedValue([mockThesis]);

      const result = await service.upsert(mockUserId, createDto);

      expect(result).toEqual(mockThesis);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          geographicFocus: expect.any(Array),
          geographicFocusNodes: expect.arrayContaining(["l1:north_america"]),
        }),
      );
    });

    it('should update thesis when one exists', async () => {
      mockDb.limit.mockResolvedValue([mockThesis]);
      mockDb.returning.mockResolvedValue([{ ...mockThesis, ...createDto }]);

      const result = await service.upsert(mockUserId, createDto);

      expect(result).toBeDefined();
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining(createDto),
      );
    });
  });

  describe('delete', () => {
    it('should delete thesis when found', async () => {
      mockDb.limit.mockResolvedValueOnce([mockThesis]);

      await service.delete(mockUserId);

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when thesis not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(service.delete(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('hasThesis', () => {
    it('should return true when active thesis exists', async () => {
      mockDb.limit.mockResolvedValue([mockThesis]);

      const result = await service.hasThesis(mockUserId);

      expect(result).toBe(true);
    });

    it('should return false when thesis does not exist', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await service.hasThesis(mockUserId);

      expect(result).toBe(false);
    });

    it('should return false when thesis is inactive', async () => {
      mockDb.limit.mockResolvedValue([{ ...mockThesis, isActive: false }]);

      const result = await service.hasThesis(mockUserId);

      expect(result).toBe(false);
    });
  });
});
