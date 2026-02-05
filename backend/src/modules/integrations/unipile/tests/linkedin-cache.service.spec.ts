import { Test, TestingModule } from '@nestjs/testing';
import { LinkedInCacheService } from '../linkedin-cache.service';
import { DrizzleService } from '../../../../database';
import type { LinkedInProfile } from '../entities';

describe('LinkedInCacheService', () => {
  let service: LinkedInCacheService;
  let drizzleService: any;

  const mockProfile: LinkedInProfile = {
    id: 'profile-123',
    firstName: 'Jane',
    lastName: 'Smith',
    headline: 'Product Manager',
    location: 'New York, NY',
    profileUrl: 'https://linkedin.com/in/jane-smith-456',
    profileImageUrl: null,
    summary: null,
    currentCompany: {
      name: 'StartupCo',
      title: 'PM',
    },
    experience: [],
    education: [],
  };

  const createMockDrizzle = () => ({
    db: {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
    },
  });

  beforeEach(async () => {
    drizzleService = createMockDrizzle();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkedInCacheService,
        { provide: DrizzleService, useValue: drizzleService },
      ],
    }).compile();

    service = module.get<LinkedInCacheService>(LinkedInCacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============ GET CACHED ============

  describe('getCached', () => {
    it('should return cached profile if not expired', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      drizzleService.db.limit.mockResolvedValueOnce([
        {
          id: 'cache-1',
          userId: 'user-1',
          linkedinUrl: 'https://linkedin.com/in/jane-smith-456',
          linkedinIdentifier: 'jane-smith-456',
          profileData: mockProfile,
          fetchedAt: new Date(),
          expiresAt: futureDate,
          createdAt: new Date(),
        },
      ]);

      const result = await service.getCached('https://linkedin.com/in/jane-smith-456');

      expect(result).toEqual(mockProfile);
      expect(drizzleService.db.where).toHaveBeenCalled();
    });

    it('should return null if cache miss', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);

      const result = await service.getCached('https://linkedin.com/in/not-cached');

      expect(result).toBeNull();
    });

    it('should return null if cache expired', async () => {
      // The query filters by expiresAt > now, so expired entries won't be returned
      drizzleService.db.limit.mockResolvedValueOnce([]);

      const result = await service.getCached('https://linkedin.com/in/expired');

      expect(result).toBeNull();
    });
  });

  // ============ SET CACHE ============

  describe('setCache', () => {
    it('should cache profile with 7-day TTL', async () => {
      await service.setCache(
        'user-1',
        'https://linkedin.com/in/jane-smith-456',
        'jane-smith-456',
        mockProfile,
      );

      expect(drizzleService.db.insert).toHaveBeenCalled();
      expect(drizzleService.db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          linkedinUrl: 'https://linkedin.com/in/jane-smith-456',
          linkedinIdentifier: 'jane-smith-456',
          profileData: mockProfile,
        }),
      );
      expect(drizzleService.db.onConflictDoUpdate).toHaveBeenCalled();
    });

    it('should set expiration to 7 days from now', async () => {
      const beforeTime = Date.now();
      await service.setCache('user-1', 'https://linkedin.com/in/test', 'test', mockProfile);
      const afterTime = Date.now();

      const callArgs = drizzleService.db.values.mock.calls[0][0];
      const expiresAt = callArgs.expiresAt.getTime();

      // Should expire 7 days from now
      const expectedMin = beforeTime + 7 * 24 * 60 * 60 * 1000;
      const expectedMax = afterTime + 7 * 24 * 60 * 60 * 1000;

      expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAt).toBeLessThanOrEqual(expectedMax);
    });

    it('should upsert on conflict', async () => {
      await service.setCache('user-1', 'https://linkedin.com/in/existing', 'existing', mockProfile);

      expect(drizzleService.db.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({
            profileData: mockProfile,
            linkedinIdentifier: 'existing',
          }),
        }),
      );
    });
  });

  // ============ CLEAR EXPIRED ============

  describe('clearExpired', () => {
    it('should delete expired entries', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([
        { id: 'cache-1' },
        { id: 'cache-2' },
        { id: 'cache-3' },
      ]);

      const count = await service.clearExpired();

      expect(count).toBe(3);
      expect(drizzleService.db.delete).toHaveBeenCalled();
      expect(drizzleService.db.where).toHaveBeenCalled();
    });

    it('should return 0 if no expired entries', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([]);

      const count = await service.clearExpired();

      expect(count).toBe(0);
    });
  });
});
