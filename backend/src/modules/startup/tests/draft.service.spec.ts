import { Test, TestingModule } from '@nestjs/testing';
import { DraftService } from '../draft.service';
import { DrizzleService } from '../../../database';

describe('DraftService', () => {
  let service: DraftService;
  let drizzleService: jest.Mocked<DrizzleService>;

  const mockDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  };

  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
  const mockStartupId = '123e4567-e89b-12d3-a456-426614174001';

  const mockDraft = {
    id: '123e4567-e89b-12d3-a456-426614174002',
    startupId: mockStartupId,
    userId: mockUserId,
    draftData: { name: 'Test', tagline: 'Test tagline' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftService,
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
            withRLS: jest.fn((userId, callback) => callback(mockDb)),
          },
        },
      ],
    }).compile();

    service = module.get<DraftService>(DraftService);
    drizzleService = module.get(DrizzleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('should create a new draft if none exists', async () => {
      const dto = {
        draftData: { name: 'Test', tagline: 'Test tagline' },
      };

      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.returning.mockResolvedValueOnce([mockDraft]);

      const result = await service.save(mockStartupId, mockUserId, dto);

      expect(result).toEqual(mockDraft);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should update existing draft', async () => {
      const dto = {
        draftData: { name: 'Updated', tagline: 'Updated tagline' },
      };

      const updatedDraft = {
        ...mockDraft,
        draftData: dto.draftData,
      };

      mockDb.limit.mockResolvedValueOnce([mockDraft]);
      mockDb.returning.mockResolvedValueOnce([updatedDraft]);

      const result = await service.save(mockStartupId, mockUserId, dto);

      expect(result).toEqual(updatedDraft);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should return draft if exists', async () => {
      mockDb.limit.mockResolvedValueOnce([mockDraft]);

      const result = await service.get(mockStartupId, mockUserId);

      expect(result).toEqual(mockDraft);
      expect(drizzleService.withRLS).toHaveBeenCalledWith(mockUserId, expect.any(Function));
    });

    it('should return null if draft does not exist', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.get(mockStartupId, mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete draft', async () => {
      await service.delete(mockStartupId);

      expect(mockDb.delete).toHaveBeenCalled();
    });
  });
});
