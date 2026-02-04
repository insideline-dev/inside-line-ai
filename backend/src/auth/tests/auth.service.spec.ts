import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService, OAuthProfile } from '../auth.service';
import { UserAuthService, DbUser } from '../user-auth.service';
import { DrizzleService } from '../../database';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../entities/auth.schema';

describe('AuthService', () => {
  let service: AuthService;
  let userAuthService: jest.Mocked<UserAuthService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let drizzleService: any;

  const mockDbUser: DbUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    emailVerified: true,
    role: UserRole.USER,
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
      delete: jest.fn().mockReturnThis(),
    };
    return { db: mockChain };
  };

  beforeEach(async () => {
    drizzleService = createMockDrizzle();

    const mockUserAuthService = {
      findUserById: jest.fn(),
      findUserByEmail: jest.fn(),
      createUser: jest.fn(),
      registerWithPassword: jest.fn(),
      validatePassword: jest.fn(),
      createMagicLink: jest.fn(),
      validateMagicLink: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key, defaultValue) => defaultValue),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserAuthService, useValue: mockUserAuthService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DrizzleService, useValue: drizzleService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userAuthService = module.get(UserAuthService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============ TOKEN GENERATION TESTS ============

  describe('generateAccessToken', () => {
    it('should generate JWT access token', () => {
      const result = service.generateAccessToken(mockDbUser);

      expect(result).toBe('mock-jwt-token');
      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: mockDbUser.id, email: mockDbUser.email },
        expect.objectContaining({ expiresIn: '7d' }),
      );
    });

    it('should use custom expiration from config', () => {
      configService.get.mockImplementation((key) => {
        if (key === 'JWT_ACCESS_EXPIRES') return '30m';
        return undefined;
      });

      service.generateAccessToken(mockDbUser);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ expiresIn: '30m' }),
      );
    });
  });

  describe('generateTokens', () => {
    it('should generate access token and store refresh token in DB', async () => {
      const result = await service.generateTokens(mockDbUser);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toHaveLength(64); // 32 bytes hex = 64 chars
      expect(drizzleService.db.insert).toHaveBeenCalled();
    });

    it('should store refresh token with correct user ID and family', async () => {
      await service.generateTokens(mockDbUser);

      expect(drizzleService.db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockDbUser.id,
          family: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
    });
  });

  // ============ JWT VALIDATION TESTS ============

  describe('validateJwt', () => {
    it('should return user for valid payload', async () => {
      userAuthService.findUserById.mockResolvedValue(mockDbUser);

      const result = await service.validateJwt({
        sub: 'user-1',
        email: 'test@example.com',
      });

      expect(result).toEqual(mockDbUser);
      expect(userAuthService.findUserById).toHaveBeenCalledWith('user-1');
    });

    it('should return undefined for non-existent user', async () => {
      userAuthService.findUserById.mockResolvedValue(undefined);

      const result = await service.validateJwt({
        sub: 'non-existent',
        email: 'test@example.com',
      });

      expect(result).toBeUndefined();
    });
  });

  // ============ TOKEN REFRESH WITH ROTATION TESTS ============

  describe('refreshTokens', () => {
    const mockStoredToken = {
      id: 'token-id-1',
      token: 'valid-refresh-token',
      userId: 'user-1',
      family: 'family-123',
      used: false,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
      createdAt: new Date(),
    };

    it('should return new tokens for valid refresh token', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockStoredToken]);
      userAuthService.findUserById.mockResolvedValue(mockDbUser);

      const result = await service.refreshTokens('valid-refresh-token');

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toHaveLength(64);
      expect(result.user).toEqual(mockDbUser);
    });

    it('should mark old token as used', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockStoredToken]);
      userAuthService.findUserById.mockResolvedValue(mockDbUser);

      await service.refreshTokens('valid-refresh-token');

      expect(drizzleService.db.update).toHaveBeenCalled();
      expect(drizzleService.db.set).toHaveBeenCalledWith({ used: true });
    });

    it('should store new token in same family', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockStoredToken]);
      userAuthService.findUserById.mockResolvedValue(mockDbUser);

      await service.refreshTokens('valid-refresh-token');

      expect(drizzleService.db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          family: mockStoredToken.family,
        }),
      );
    });

    it('should throw UnauthorizedException for non-existent token', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);

      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for expired token', async () => {
      const expiredToken = {
        ...mockStoredToken,
        expiresAt: new Date(Date.now() - 1000), // Expired
      };
      drizzleService.db.limit.mockResolvedValueOnce([expiredToken]);

      await expect(service.refreshTokens('expired-token')).rejects.toThrow(
        'Refresh token expired',
      );
    });

    it('should detect token reuse attack and invalidate family', async () => {
      const usedToken = { ...mockStoredToken, used: true };
      drizzleService.db.limit.mockResolvedValueOnce([usedToken]);

      await expect(service.refreshTokens('reused-token')).rejects.toThrow(
        'Token reuse detected',
      );

      // Should delete all tokens in family
      expect(drizzleService.db.delete).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if user not found', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockStoredToken]);
      userAuthService.findUserById.mockResolvedValue(undefined);

      await expect(service.refreshTokens('valid-token')).rejects.toThrow(
        'User not found',
      );
    });
  });

  // ============ TOKEN REVOCATION TESTS ============

  describe('revokeAllUserTokens', () => {
    it('should delete all refresh tokens for user', async () => {
      await service.revokeAllUserTokens('user-1');

      expect(drizzleService.db.delete).toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired tokens and return count', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([
        { id: '1' },
        { id: '2' },
      ]);

      const count = await service.cleanupExpiredTokens();

      expect(count).toBe(2);
      expect(drizzleService.db.delete).toHaveBeenCalled();
    });
  });

  // ============ OAUTH TESTS ============

  describe('findOrCreateOAuthUser', () => {
    const oauthProfile: OAuthProfile = {
      providerType: 'google',
      providerAccountId: 'google-123',
      email: 'oauth@example.com',
      name: 'OAuth User',
      image: 'https://example.com/avatar.jpg',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    };

    it('should return existing user if OAuth account exists', async () => {
      const existingAccount = { id: 'acc-1', userId: 'user-1' };
      drizzleService.db.limit.mockResolvedValueOnce([existingAccount]);
      userAuthService.findUserById.mockResolvedValue(mockDbUser);

      const result = await service.findOrCreateOAuthUser(oauthProfile);

      expect(result).toEqual(mockDbUser);
      expect(userAuthService.createUser).not.toHaveBeenCalled();
    });

    it('should create new user if no existing account or user', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]); // No existing account
      userAuthService.findUserByEmail.mockResolvedValue(undefined);
      userAuthService.createUser.mockResolvedValue(mockDbUser);

      const result = await service.findOrCreateOAuthUser(oauthProfile);

      expect(result).toEqual(mockDbUser);
      expect(userAuthService.createUser).toHaveBeenCalledWith({
        email: oauthProfile.email,
        name: oauthProfile.name,
        image: oauthProfile.image,
        emailVerified: true,
      });
    });

    it('should link OAuth account to existing user with same email', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]); // No existing account
      userAuthService.findUserByEmail.mockResolvedValue(mockDbUser);

      const result = await service.findOrCreateOAuthUser(oauthProfile);

      expect(result).toEqual(mockDbUser);
      expect(userAuthService.createUser).not.toHaveBeenCalled();
      expect(drizzleService.db.insert).toHaveBeenCalled();
    });

    it('should update tokens when existing account found', async () => {
      const existingAccount = { id: 'acc-1', userId: 'user-1' };
      drizzleService.db.limit.mockResolvedValueOnce([existingAccount]);
      userAuthService.findUserById.mockResolvedValue(mockDbUser);

      await service.findOrCreateOAuthUser(oauthProfile);

      expect(drizzleService.db.update).toHaveBeenCalled();
    });

    it('should handle duplicate account conflict gracefully', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]); // No existing account
      userAuthService.findUserByEmail.mockResolvedValue(mockDbUser);
      drizzleService.db.values.mockRejectedValueOnce(
        new Error('unique constraint violation'),
      );

      await expect(service.findOrCreateOAuthUser(oauthProfile)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ============ DELEGATE METHOD TESTS ============

  describe('delegate methods', () => {
    it('should delegate registerWithPassword to userAuth', async () => {
      userAuthService.registerWithPassword.mockResolvedValue(mockDbUser);

      await service.registerWithPassword(
        'test@example.com',
        'Pass123!',
        'Test',
      );

      expect(userAuthService.registerWithPassword).toHaveBeenCalledWith(
        'test@example.com',
        'Pass123!',
        'Test',
      );
    });

    it('should delegate validatePassword to userAuth', async () => {
      userAuthService.validatePassword.mockResolvedValue(mockDbUser);

      await service.validatePassword('test@example.com', 'password');

      expect(userAuthService.validatePassword).toHaveBeenCalledWith(
        'test@example.com',
        'password',
      );
    });

    it('should delegate createMagicLink to userAuth', async () => {
      userAuthService.createMagicLink.mockResolvedValue('token-123');

      await service.createMagicLink('test@example.com');

      expect(userAuthService.createMagicLink).toHaveBeenCalledWith(
        'test@example.com',
      );
    });

    it('should delegate validateMagicLink to userAuth', async () => {
      userAuthService.validateMagicLink.mockResolvedValue(mockDbUser);

      await service.validateMagicLink('token-123');

      expect(userAuthService.validateMagicLink).toHaveBeenCalledWith(
        'token-123',
      );
    });

    it('should delegate findUserById to userAuth', async () => {
      userAuthService.findUserById.mockResolvedValue(mockDbUser);

      await service.findUserById('user-1');

      expect(userAuthService.findUserById).toHaveBeenCalledWith('user-1');
    });
  });
});
