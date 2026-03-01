import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { UnipileService } from '../unipile.service';
import { LinkedInCacheService } from '../linkedin-cache.service';
import type { LinkedInProfile } from '../entities';

describe('UnipileService', () => {
  let service: UnipileService;
  let configService: { get: jest.Mock };
  let cacheService: { getCached: jest.Mock; setCache: jest.Mock; clearExpired: jest.Mock };

  const mockProfile: LinkedInProfile = {
    id: 'profile-123',
    firstName: 'John',
    lastName: 'Doe',
    headline: 'Software Engineer at TechCorp',
    location: 'San Francisco, CA',
    profileUrl: 'https://linkedin.com/in/john-doe-123',
    profileImageUrl: 'https://example.com/photo.jpg',
    summary: 'Experienced software engineer...',
    currentCompany: {
      name: 'TechCorp',
      title: 'Senior Engineer',
    },
    experience: [
      {
        company: 'TechCorp',
        title: 'Senior Engineer',
        startDate: '2020-01',
        endDate: null,
        current: true,
        location: '',
        description: '',
        companyPictureUrl: null,
      },
    ],
    education: [
      {
        school: 'MIT',
        degree: 'BS',
        fieldOfStudy: 'Computer Science',
        startYear: 2012,
        endYear: 2016,
        startDate: undefined,
        endDate: null,
        description: '',
        schoolPictureUrl: null,
      },
    ],
  };

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          UNIPILE_DSN: 'api.unipile.com',
          UNIPILE_API_KEY: 'test-api-key',
          UNIPILE_ACCOUNT_ID: 'test-account-id',
        };
        return config[key];
      }),
    };

    cacheService = {
      getCached: jest.fn().mockResolvedValue(null),
      setCache: jest.fn().mockResolvedValue(undefined),
      clearExpired: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnipileService,
        { provide: ConfigService, useValue: configService },
        { provide: LinkedInCacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get<UnipileService>(UnipileService);

    // Mock global fetch
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============ CONFIGURATION ============

  describe('isConfigured', () => {
    it('should return true when all env vars are set', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when env vars are missing', () => {
      configService.get = jest.fn().mockReturnValue(undefined);
      const unconfiguredService = new UnipileService(configService, cacheService);
      expect(unconfiguredService.isConfigured()).toBe(false);
    });
  });

  // ============ GET PROFILE ============

  describe('getProfile', () => {
    it('should throw ServiceUnavailableException if not configured', async () => {
      configService.get = jest.fn().mockReturnValue(undefined);
      const unconfiguredService = new UnipileService(configService, cacheService);

      await expect(
        unconfiguredService.getProfile('user-1', 'https://linkedin.com/in/john-doe'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should return cached profile if available', async () => {
      cacheService.getCached.mockResolvedValueOnce(mockProfile);

      const result = await service.getProfile('user-1', 'https://linkedin.com/in/john-doe-123');

      expect(result).toEqual(mockProfile);
      expect(cacheService.getCached).toHaveBeenCalledWith('https://linkedin.com/in/john-doe-123');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fetch from API if cache miss', async () => {
      cacheService.getCached.mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'profile-123',
          first_name: 'John',
          last_name: 'Doe',
          headline: 'Software Engineer at TechCorp',
          location: 'San Francisco, CA',
          profile_url: 'https://linkedin.com/in/john-doe-123',
          profile_image_url: 'https://example.com/photo.jpg',
          summary: 'Experienced software engineer...',
          current_company: {
            name: 'TechCorp',
            title: 'Senior Engineer',
          },
          experience: [
            {
              company: 'TechCorp',
              title: 'Senior Engineer',
              start_date: '2020-01',
              end_date: null,
              current: true,
            },
          ],
          education: [
            {
              school: 'MIT',
              degree: 'BS',
              field_of_study: 'Computer Science',
              start_year: 2012,
              end_year: 2016,
            },
          ],
        }),
      });

      const result = await service.getProfile('user-1', 'https://linkedin.com/in/john-doe-123');

      expect(result).toEqual(mockProfile);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.unipile.com/api/v1/users/john-doe-123?account_id=test-account-id&linkedin_sections=*',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'X-API-KEY': 'test-api-key',
          }),
        }),
      );
      expect(cacheService.setCache).toHaveBeenCalledWith(
        'user-1',
        'https://linkedin.com/in/john-doe-123',
        'john-doe-123',
        mockProfile,
      );
    });

    it('should return profile even if cache write fails', async () => {
      cacheService.getCached.mockResolvedValueOnce(null);
      cacheService.setCache.mockRejectedValueOnce(new Error('db write failed'));
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'profile-123',
          first_name: 'John',
          last_name: 'Doe',
          headline: 'Software Engineer at TechCorp',
          location: 'San Francisco, CA',
          profile_url: 'https://linkedin.com/in/john-doe-123',
          profile_image_url: 'https://example.com/photo.jpg',
          summary: 'Experienced software engineer...',
          current_company: {
            name: 'TechCorp',
            title: 'Senior Engineer',
          },
          experience: [
            {
              company: 'TechCorp',
              title: 'Senior Engineer',
              start_date: '2020-01',
              end_date: null,
              current: true,
            },
          ],
          education: [
            {
              school: 'MIT',
              degree: 'BS',
              field_of_study: 'Computer Science',
              start_year: 2012,
              end_year: 2016,
            },
          ],
        }),
      });

      const result = await service.getProfile('user-1', 'https://linkedin.com/in/john-doe-123');

      expect(result).toEqual(mockProfile);
      expect(cacheService.setCache).toHaveBeenCalledTimes(1);
    });

    it('should extract profile image from LinkedIn vector image object', async () => {
      cacheService.getCached.mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'profile-123',
          first_name: 'John',
          last_name: 'Doe',
          headline: 'Software Engineer at TechCorp',
          location: 'San Francisco, CA',
          profile_url: 'https://linkedin.com/in/john-doe-123',
          profile_picture: {
            rootUrl: 'https://media.licdn.com/dms/image/',
            artifacts: [
              { width: 100, height: 100, fileIdentifyingUrlPathSegment: 'v1/100.jpg' },
              { width: 400, height: 400, fileIdentifyingUrlPathSegment: 'v1/400.jpg' },
            ],
          },
          summary: 'Experienced software engineer...',
          experience: [],
          education: [],
        }),
      });

      const result = await service.getProfile('user-1', 'https://linkedin.com/in/john-doe-123');

      expect(result?.profileImageUrl).toBe('https://media.licdn.com/dms/image/v1/400.jpg');
    });

    it('should extract profile image from nested image fields', async () => {
      cacheService.getCached.mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'profile-123',
          first_name: 'John',
          last_name: 'Doe',
          headline: 'Software Engineer at TechCorp',
          location: 'San Francisco, CA',
          profile_url: 'https://linkedin.com/in/john-doe-123',
          summary: 'Experienced software engineer...',
          media: {
            profile: {
              avatar: {
                url: '//media.licdn.com/dms/image/C4D03AQ.jpg',
              },
            },
          },
          experience: [],
          education: [],
        }),
      });

      const result = await service.getProfile('user-1', 'https://linkedin.com/in/john-doe-123');

      expect(result?.profileImageUrl).toBe('https://media.licdn.com/dms/image/C4D03AQ.jpg');
    });

    it('should return null if profile not found (404)', async () => {
      cacheService.getCached.mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await service.getProfile('user-1', 'https://linkedin.com/in/not-found');

      expect(result).toBeNull();
      expect(cacheService.setCache).not.toHaveBeenCalled();
    });

    it('should return null for recoverable 422 invalid_recipient errors', async () => {
      cacheService.getCached.mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () =>
          JSON.stringify({
            status: 422,
            type: 'errors/invalid_recipient',
            title: 'Recipient cannot be reached',
            detail:
              'Make sure that the recipient ID is valid and that the corresponding profile is not locked.',
          }),
      });

      const result = await service.getProfile('user-1', 'https://linkedin.com/in/locked-profile');

      expect(result).toBeNull();
      expect(cacheService.setCache).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException on API error', async () => {
      cacheService.getCached.mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid request',
      });

      await expect(
        service.getProfile('user-1', 'https://linkedin.com/in/john-doe'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============ SEARCH PROFILES ============

  describe('searchProfiles', () => {
    it('should throw ServiceUnavailableException if not configured', async () => {
      configService.get = jest.fn().mockReturnValue(undefined);
      const unconfiguredService = new UnipileService(configService, cacheService);

      await expect(unconfiguredService.searchProfiles('John Doe')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should search profiles by name only', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'profile-123',
              first_name: 'John',
              last_name: 'Doe',
              headline: 'Software Engineer',
              location: 'SF',
              profile_url: 'https://linkedin.com/in/john-doe-123',
              experience: [],
              education: [],
            },
          ],
        }),
      });

      const result = await service.searchProfiles('John Doe');

      expect(result).toHaveLength(1);
      expect(result[0].firstName).toBe('John');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.unipile.com/api/v1/linkedin/search?account_id=test-account-id',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ api: 'classic', category: 'people', keywords: 'John Doe' }),
        }),
      );
    });

    it('should search profiles by name and company', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });

      await service.searchProfiles('John Doe', 'TechCorp');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.unipile.com/api/v1/linkedin/search?account_id=test-account-id',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            api: 'classic',
            category: 'people',
            keywords: 'John Doe',
            advanced_keywords: { company: 'TechCorp' },
          }),
        }),
      );
    });

    it('should throw BadRequestException on API error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      await expect(service.searchProfiles('John Doe')).rejects.toThrow(BadRequestException);
    });

    it('should return empty array if no results', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });

      const result = await service.searchProfiles('Unknown Person');

      expect(result).toEqual([]);
    });
  });
});
