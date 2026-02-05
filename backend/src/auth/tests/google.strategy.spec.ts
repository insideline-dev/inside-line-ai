import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleStrategy } from '../strategies/google.strategy';
import { AuthService } from '../auth.service';
import { DbUser } from '../user-auth.service';
import { UserRole } from '../entities/auth.schema';
import type { Profile } from 'passport-google-oauth20';

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;
  let authService: any;
  let loggerSpy: any;

  const mockUser: DbUser = {
    id: 'user-1',
    email: 'google@example.com',
    name: 'Google User',
    image: 'https://example.com/avatar.jpg',
    emailVerified: true,
    role: UserRole.FOUNDER,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockProfile = (overrides: Partial<Profile> = {}): Profile =>
    ({
      id: 'google-123',
      displayName: 'Google User',
      emails: [{ value: 'google@example.com', verified: true }],
      photos: [{ value: 'https://example.com/avatar.jpg' }],
      provider: 'google',
      _raw: '',
      _json: {},
      ...overrides,
    }) as Profile;

  beforeEach(async () => {
    const mockAuthService = {
      findOrCreateOAuthUser: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          GOOGLE_CLIENT_ID: 'test-client-id',
          GOOGLE_CLIENT_SECRET: 'test-client-secret',
          APP_URL: 'http://localhost:3001',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleStrategy,
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get<GoogleStrategy>(GoogleStrategy);
    authService = module.get(AuthService);

    // Silence logger during tests
    loggerSpy = jest
      .spyOn((strategy as any).logger, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    if (loggerSpy) loggerSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return user for valid Google profile', async () => {
      const profile = createMockProfile();
      const accessToken = 'access-token';
      const refreshToken = 'refresh-token';
      const done = jest.fn();

      authService.findOrCreateOAuthUser.mockResolvedValue(mockUser);

      await strategy.validate(accessToken, refreshToken, profile, done);

      expect(authService.findOrCreateOAuthUser).toHaveBeenCalledWith({
        providerType: 'google',
        providerAccountId: 'google-123',
        email: 'google@example.com',
        name: 'Google User',
        image: 'https://example.com/avatar.jpg',
        accessToken,
        refreshToken,
        expiresAt: expect.any(Date),
      });
      expect(done).toHaveBeenCalledWith(null, mockUser);
    });

    it('should call done with error if no email provided', async () => {
      const profile = createMockProfile({ emails: [] });
      const done = jest.fn();

      await strategy.validate('token', 'refresh', profile, done);

      expect(done).toHaveBeenCalledWith(expect.any(Error), false);
      expect(authService.findOrCreateOAuthUser).not.toHaveBeenCalled();
    });

    it('should call done with error if emails undefined', async () => {
      const profile = createMockProfile({ emails: undefined });
      const done = jest.fn();

      await strategy.validate('token', 'refresh', profile, done);

      expect(done).toHaveBeenCalledWith(expect.any(Error), false);
    });

    it('should use email prefix as name if displayName missing', async () => {
      const profile = createMockProfile({
        displayName: '',
        emails: [{ value: 'noname@example.com', verified: true }],
      });
      const done = jest.fn();

      authService.findOrCreateOAuthUser.mockResolvedValue(mockUser);

      await strategy.validate('token', 'refresh', profile, done);

      expect(authService.findOrCreateOAuthUser).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'noname' }),
      );
    });

    it('should handle missing photo gracefully', async () => {
      const profile = createMockProfile({ photos: [] });
      const done = jest.fn();

      authService.findOrCreateOAuthUser.mockResolvedValue(mockUser);

      await strategy.validate('token', 'refresh', profile, done);

      expect(authService.findOrCreateOAuthUser).toHaveBeenCalledWith(
        expect.objectContaining({ image: undefined }),
      );
    });

    it('should call done with error if authService throws', async () => {
      const profile = createMockProfile();
      const done = jest.fn();
      const error = new Error('Auth service error');

      authService.findOrCreateOAuthUser.mockRejectedValue(error);

      await strategy.validate('token', 'refresh', profile, done);

      expect(done).toHaveBeenCalledWith(error, false);
    });

    it('should store access and refresh tokens', async () => {
      const profile = createMockProfile();
      const accessToken = 'my-access-token';
      const refreshToken = 'my-refresh-token';
      const done = jest.fn();

      authService.findOrCreateOAuthUser.mockResolvedValue(mockUser);

      await strategy.validate(accessToken, refreshToken, profile, done);

      expect(authService.findOrCreateOAuthUser).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'my-access-token',
          refreshToken: 'my-refresh-token',
        }),
      );
    });

    it('should set token expiration to 1 hour from now', async () => {
      const profile = createMockProfile();
      const done = jest.fn();
      const now = Date.now();

      authService.findOrCreateOAuthUser.mockResolvedValue(mockUser);

      await strategy.validate('token', 'refresh', profile, done);

      const call = authService.findOrCreateOAuthUser.mock.calls[0][0];
      const expiresAt = call.expiresAt as Date;

      // Should be approximately 1 hour from now (within 5 seconds tolerance)
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(now + 55 * 60 * 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(now + 65 * 60 * 1000);
    });
  });
});
