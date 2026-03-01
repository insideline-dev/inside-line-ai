import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PortalService } from '../portal.service';
import { DrizzleService } from '../../../database';

describe('PortalService', () => {
  let service: PortalService;
  let drizzleService: jest.Mocked<DrizzleService>;

  const createMockDb = () => {
    const mockChain = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockResolvedValue([]),
      orderBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    };
    return mockChain;
  };

  let mockDb: ReturnType<typeof createMockDb>;

  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
  const mockPortalId = '123e4567-e89b-12d3-a456-426614174001';

  const mockPortal = {
    id: mockPortalId,
    userId: mockUserId,
    name: 'Acme Ventures',
    slug: 'acme-ventures',
    description: 'We invest in early-stage startups',
    logoUrl: 'https://example.com/logo.png',
    brandColor: '#FF0000',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalService,
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
            withRLS: jest.fn((userId, callback) => callback(mockDb)),
          },
        },
      ],
    }).compile();

    service = module.get<PortalService>(PortalService);
    drizzleService = module.get(DrizzleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a portal with auto-generated slug', async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.returning.mockResolvedValueOnce([mockPortal]);

      const dto = {
        name: 'Acme Ventures',
        description: 'We invest in early-stage startups',
        brandColor: '#FF0000',
      };

      const result = await service.create(mockUserId, dto);

      expect(result).toEqual(mockPortal);
      expect(drizzleService.withRLS).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function),
      );
    });

    it('should create a portal with custom slug', async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.returning.mockResolvedValueOnce([
        { ...mockPortal, slug: 'custom-slug' },
      ]);

      const dto = {
        name: 'Acme Ventures',
        slug: 'custom-slug',
        description: 'We invest in early-stage startups',
        brandColor: '#FF0000',
      };

      const result = await service.create(mockUserId, dto);

      expect(result.slug).toBe('custom-slug');
    });

    it('should reject duplicate slug', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 'existing' }]);

      const dto = {
        name: 'Acme Ventures',
        slug: 'acme-ventures',
        description: 'We invest in early-stage startups',
        brandColor: '#FF0000',
      };

      await expect(service.create(mockUserId, dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated portals', async () => {
      const originalPromiseAll = Promise.all;
      jest.spyOn(Promise, 'all').mockResolvedValueOnce([
        [mockPortal],
        [{ count: 1 }],
      ] as unknown);

      const query = { page: 1, limit: 10 };
      const result = await service.findAll(mockUserId, query);

      expect(result.data).toEqual([mockPortal]);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      Promise.all = originalPromiseAll;
    });
  });

  describe('findOne', () => {
    it('should return a portal by ID', async () => {
      mockDb.limit.mockResolvedValueOnce([mockPortal]);

      const result = await service.findOne(mockPortalId, mockUserId);

      expect(result).toEqual(mockPortal);
    });

    it('should throw NotFoundException if portal not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.findOne(mockPortalId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBySlug', () => {
    it('should return active portal by slug', async () => {
      mockDb.limit.mockResolvedValueOnce([mockPortal]);

      const result = await service.findBySlug('acme-ventures');

      expect(result).toEqual(mockPortal);
    });

    it('should throw NotFoundException if portal not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.findBySlug('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a portal', async () => {
      mockDb.limit.mockResolvedValueOnce([mockPortal]);
      mockDb.returning.mockResolvedValueOnce([
        { ...mockPortal, name: 'Updated Name' },
      ]);

      const dto = { name: 'Updated Name' };
      const result = await service.update(mockPortalId, mockUserId, dto);

      expect(result.name).toBe('Updated Name');
    });

    it('should throw NotFoundException if portal not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.update(mockPortalId, mockUserId, { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete a portal', async () => {
      mockDb.limit.mockResolvedValueOnce([mockPortal]);

      await service.delete(mockPortalId, mockUserId);

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException if portal not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.delete(mockPortalId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('isSlugTaken', () => {
    it('should return true if slug is taken', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 'existing' }]);

      const result = await service.isSlugTaken('acme-ventures');

      expect(result).toBe(true);
    });

    it('should return false if slug is available', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.isSlugTaken('available-slug');

      expect(result).toBe(false);
    });
  });
});
