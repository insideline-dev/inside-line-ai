import { Test, TestingModule } from '@nestjs/testing';
import { ProfileService, DbUserProfile } from '../profile.service';
import { DrizzleService } from '../../database';

describe('ProfileService', () => {
  let service: ProfileService;
  let drizzleService: ReturnType<typeof createMockDrizzle>;

  const mockProfile: DbUserProfile = {
    id: 'profile-1',
    userId: 'user-1',
    companyName: 'Test Company',
    title: 'Software Engineer',
    linkedinUrl: 'https://linkedin.com/in/testuser',
    bio: 'Test bio',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockDrizzle = () => {
    const mockChain = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };
    return { db: mockChain };
  };

  beforeEach(async () => {
    drizzleService = createMockDrizzle();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: DrizzleService, useValue: drizzleService },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============ GET PROFILE TESTS ============

  describe('getProfile', () => {
    it('should return existing profile if found', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockProfile]);

      const result = await service.getProfile('user-1');

      expect(result).toEqual(mockProfile);
      expect(drizzleService.db.select).toHaveBeenCalled();
      expect(drizzleService.db.insert).not.toHaveBeenCalled();
    });

    it('should create profile if none exists', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]); // No existing profile
      drizzleService.db.returning.mockResolvedValueOnce([mockProfile]); // Created profile

      const result = await service.getProfile('user-1');

      expect(result).toEqual(mockProfile);
      expect(drizzleService.db.insert).toHaveBeenCalled();
      expect(drizzleService.db.values).toHaveBeenCalledWith({
        userId: 'user-1',
      });
    });

    it('should throw error if profile creation fails', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]); // No existing profile
      drizzleService.db.returning.mockResolvedValueOnce([]); // Failed to create

      await expect(service.getProfile('user-1')).rejects.toThrow(
        'Failed to create user profile',
      );
    });
  });

  // ============ UPDATE PROFILE TESTS ============

  describe('updateProfile', () => {
    it('should update profile with provided data', async () => {
      const updateData = {
        companyName: 'New Company',
        title: 'Senior Engineer',
      };

      drizzleService.db.limit.mockResolvedValueOnce([mockProfile]); // getProfile
      drizzleService.db.returning.mockResolvedValueOnce([
        { ...mockProfile, ...updateData },
      ]);

      const result = await service.updateProfile('user-1', updateData);

      expect(result.companyName).toBe('New Company');
      expect(result.title).toBe('Senior Engineer');
      expect(drizzleService.db.update).toHaveBeenCalled();
      expect(drizzleService.db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          companyName: 'New Company',
          title: 'Senior Engineer',
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('should update only provided fields', async () => {
      const updateData = { bio: 'Updated bio' };

      drizzleService.db.limit.mockResolvedValueOnce([mockProfile]);
      drizzleService.db.returning.mockResolvedValueOnce([
        { ...mockProfile, ...updateData },
      ]);

      await service.updateProfile('user-1', updateData);

      expect(drizzleService.db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          bio: 'Updated bio',
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('should create profile if it does not exist before updating', async () => {
      const updateData = { title: 'New Title' };

      drizzleService.db.limit.mockResolvedValueOnce([]); // No existing profile
      drizzleService.db.returning
        .mockResolvedValueOnce([mockProfile]) // Created profile
        .mockResolvedValueOnce([{ ...mockProfile, ...updateData }]); // Updated profile

      await service.updateProfile('user-1', updateData);

      expect(drizzleService.db.insert).toHaveBeenCalled();
      expect(drizzleService.db.update).toHaveBeenCalled();
    });

    it('should throw error if profile update fails', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockProfile]);
      drizzleService.db.returning.mockResolvedValueOnce([]); // Failed to update

      await expect(
        service.updateProfile('user-1', { title: 'New Title' }),
      ).rejects.toThrow('Failed to update user profile');
    });

    it('should handle linkedin URL updates', async () => {
      const updateData = {
        linkedinUrl: 'https://linkedin.com/in/newtestuser',
      };

      drizzleService.db.limit.mockResolvedValueOnce([mockProfile]);
      drizzleService.db.returning.mockResolvedValueOnce([
        { ...mockProfile, ...updateData },
      ]);

      const result = await service.updateProfile('user-1', updateData);

      expect(result.linkedinUrl).toBe('https://linkedin.com/in/newtestuser');
    });

    it('should handle multiple field updates', async () => {
      const updateData = {
        companyName: 'Multi Corp',
        title: 'CTO',
        linkedinUrl: 'https://linkedin.com/in/cto',
        bio: 'New bio text',
      };

      drizzleService.db.limit.mockResolvedValueOnce([mockProfile]);
      drizzleService.db.returning.mockResolvedValueOnce([
        { ...mockProfile, ...updateData },
      ]);

      const result = await service.updateProfile('user-1', updateData);

      expect(result.companyName).toBe('Multi Corp');
      expect(result.title).toBe('CTO');
      expect(result.linkedinUrl).toBe('https://linkedin.com/in/cto');
      expect(result.bio).toBe('New bio text');
    });
  });
});
