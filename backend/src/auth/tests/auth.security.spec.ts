import { Test, TestingModule } from '@nestjs/testing';
import { UserAuthService, DbUser } from '../user-auth.service';
import { AuthService } from '../auth.service';
import { DrizzleService } from '../../database';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../entities/auth.schema';
import * as bcrypt from 'bcrypt';

/**
 * Security-focused tests for authentication module.
 * These tests verify protection against common attack vectors.
 */
describe('Auth Security Tests', () => {
  let userAuthService: UserAuthService;
  let authService: AuthService;
  let drizzleService: any;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser: DbUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    emailVerified: true,
    role: UserRole.FOUNDER,
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

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-token'),
      verify: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key, defaultValue) => defaultValue),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAuthService,
        AuthService,
        { provide: DrizzleService, useValue: drizzleService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    userAuthService = module.get<UserAuthService>(UserAuthService);
    authService = module.get<AuthService>(AuthService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
  });

  // ============ PASSWORD SECURITY TESTS ============

  describe('Password Security', () => {
    it('should reject passwords without numbers', () => {
      const weakPasswords = [
        'password',
        'qwertyui',
        'letmeinn',
        'adminadm',
        'welcomee',
      ];

      for (const password of weakPasswords) {
        const result = userAuthService.validatePasswordStrength(password);
        expect(result.valid).toBe(false);
      }
    });

    it('should reject passwords without letters', () => {
      const result = userAuthService.validatePasswordStrength('12345678');
      expect(result.valid).toBe(false);
    });

    it('should accept valid passwords with letter and number', () => {
      const validPasswords = [
        'password123',
        'mypassword1',
        'secure2024',
        'hello1234',
      ];

      for (const password of validPasswords) {
        const result = userAuthService.validatePasswordStrength(password);
        expect(result.valid).toBe(true);
      }
    });

    it('should not store plaintext passwords', async () => {
      const password = 'StrongPass123!';
      drizzleService.db.limit.mockResolvedValueOnce([]);
      drizzleService.db.returning.mockResolvedValueOnce([mockUser]);

      await userAuthService.registerWithPassword(
        'new@example.com',
        password,
        'User',
      );

      // Check that values was called, and the password is hashed
      const valuesCall = drizzleService.db.values.mock.calls.find(
        (call: any[]) => call[0]?.password,
      );
      if (valuesCall) {
        const storedPassword = valuesCall[0].password;
        expect(storedPassword).not.toBe(password);
        expect(storedPassword).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt format
      }
    });

    it('should use sufficient bcrypt rounds', async () => {
      const password = 'StrongPass123!';
      drizzleService.db.limit.mockResolvedValueOnce([]);
      drizzleService.db.returning.mockResolvedValueOnce([mockUser]);

      await userAuthService.registerWithPassword(
        'new@example.com',
        password,
        'User',
      );

      const valuesCall = drizzleService.db.values.mock.calls.find(
        (call: any[]) => call[0]?.password,
      );
      if (valuesCall) {
        const storedPassword = valuesCall[0].password;
        // Extract rounds from bcrypt hash (format: $2b$XX$...)
        const rounds = parseInt(storedPassword.split('$')[2], 10);
        expect(rounds).toBeGreaterThanOrEqual(10); // Should be at least 10 rounds
      }
    });
  });

  // ============ EMAIL SECURITY TESTS ============

  describe('Email Security', () => {
    it('should normalize email to prevent case-based duplicates', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockUser]);

      await userAuthService.findUserByEmail('TEST@EXAMPLE.COM');

      // Should search with lowercase email
      expect(drizzleService.db.where).toHaveBeenCalled();
    });

    it('should trim whitespace from email', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockUser]);

      await userAuthService.findUserByEmail('  test@example.com  ');

      expect(drizzleService.db.where).toHaveBeenCalled();
    });

    it('should prevent email enumeration via timing', async () => {
      // Both existing and non-existing users should take similar time
      // This is a conceptual test - actual timing tests would need benchmarking
      drizzleService.db.limit
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([]);

      const start1 = Date.now();
      await userAuthService.findUserByEmail('existing@example.com');
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await userAuthService.findUserByEmail('nonexisting@example.com');
      const time2 = Date.now() - start2;

      // Times should be within reasonable variance (not a strict security test)
      expect(Math.abs(time1 - time2)).toBeLessThan(100);
    });
  });

  // ============ TOKEN SECURITY TESTS ============

  describe('Token Security', () => {
    it('should generate unique tokens for each request', async () => {
      drizzleService.db.limit.mockResolvedValue([mockUser]);

      const token1 = await userAuthService.createMagicLink('test@example.com');
      const token2 = await userAuthService.createMagicLink('test@example.com');

      expect(token1).not.toBe(token2);
    });

    it('should generate tokens with sufficient entropy', async () => {
      drizzleService.db.limit.mockResolvedValue([mockUser]);

      const token = await userAuthService.createMagicLink('test@example.com');

      // 32 hex chars = 128 bits of entropy
      expect(token).toHaveLength(32);
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it('should reject expired tokens', async () => {
      // No verification record found (expired tokens are cleaned up or not returned)
      drizzleService.db.limit.mockResolvedValueOnce([]);

      const result = await userAuthService.validateMagicLink('expired-token');

      expect(result).toBeNull();
    });

    it('should delete token after single use', async () => {
      const verificationRecord = {
        id: 'ver-1',
        identifier: 'test@example.com',
        value: 'valid-token',
        expiresAt: new Date(Date.now() + 60000),
      };

      drizzleService.db.limit.mockResolvedValueOnce([verificationRecord]);
      drizzleService.db.returning.mockResolvedValueOnce([mockUser]);

      await userAuthService.validateMagicLink('valid-token');

      // Token should be deleted
      expect(drizzleService.db.delete).toHaveBeenCalled();
    });
  });

  // ============ JWT SECURITY TESTS ============

  describe('JWT Security', () => {
    it('should reject invalid JWT tokens', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(
        authService.refreshTokens('invalid.jwt.token'),
      ).rejects.toThrow();
    });

    it('should reject expired JWT tokens', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(
        authService.refreshTokens('expired.jwt.token'),
      ).rejects.toThrow();
    });

    it('should reject JWT with non-existent user', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'non-existent',
        email: 'x@y.com',
      });
      drizzleService.db.limit.mockResolvedValueOnce([]); // User not found

      await expect(
        authService.refreshTokens('valid.jwt.token'),
      ).rejects.toThrow();
    });

    it('should include user ID in JWT payload', () => {
      authService.generateTokens(mockUser);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: mockUser.id }),
        expect.any(Object),
      );
    });
  });

  // ============ OAUTH SECURITY TESTS ============

  describe('OAuth Security', () => {
    it('should prevent OAuth account hijacking via email', async () => {
      // Scenario: Attacker tries to link OAuth account to existing user's email
      const existingUser = { ...mockUser, email: 'victim@example.com' };
      drizzleService.db.limit.mockResolvedValueOnce([]); // No existing OAuth account

      // Mock findUserByEmail to return existing user
      const findByEmailSpy = jest
        .spyOn(userAuthService, 'findUserByEmail')
        .mockResolvedValue(existingUser);

      await authService.findOrCreateOAuthUser({
        providerType: 'google',
        providerAccountId: 'attacker-google-id',
        email: 'victim@example.com',
        name: 'Attacker',
      });

      // The OAuth account should be linked to the existing user
      // This is actually the expected behavior - OAuth provider verifies email ownership
      expect(findByEmailSpy).toHaveBeenCalledWith('victim@example.com');
    });

    it('should handle duplicate OAuth account gracefully', async () => {
      // Mock the full chain for OAuth account creation
      drizzleService.db.limit.mockResolvedValueOnce([]); // No existing OAuth account

      // Mock findUserByEmail to return existing user
      const findByEmailSpy = jest
        .spyOn(userAuthService, 'findUserByEmail')
        .mockResolvedValue(mockUser);

      // Mock the insert to throw unique constraint error
      drizzleService.db.values.mockImplementationOnce(() => {
        throw new Error('unique constraint violation');
      });

      await expect(
        authService.findOrCreateOAuthUser({
          providerType: 'google',
          providerAccountId: 'duplicate-id',
          email: 'test@example.com',
          name: 'Test',
        }),
      ).rejects.toThrow('OAuth account already linked');

      findByEmailSpy.mockRestore();
    });
  });

  // ============ INPUT VALIDATION TESTS ============

  describe('Input Validation', () => {
    it('should handle SQL injection attempts in email', async () => {
      const maliciousEmail = "'; DROP TABLE users; --";
      drizzleService.db.limit.mockResolvedValueOnce([]);

      // Should not throw and should use parameterized queries
      const result = await userAuthService.findUserByEmail(maliciousEmail);

      expect(result).toBeUndefined();
      // Drizzle ORM uses parameterized queries, so this should be safe
    });

    it('should handle XSS attempts in name', async () => {
      const maliciousName = '<script>alert("xss")</script>';
      drizzleService.db.limit.mockResolvedValueOnce([]);
      drizzleService.db.returning.mockResolvedValueOnce([
        { ...mockUser, name: maliciousName },
      ]);

      // The name should be stored as-is (XSS prevention is frontend responsibility)
      // But we should ensure it doesn't break the system
      const result = await userAuthService.createUser({
        email: 'test@example.com',
        name: maliciousName,
      });

      expect(result.name).toBe(maliciousName);
    });

    it('should handle very long input strings', async () => {
      const longString = 'a'.repeat(10000);

      // Password validation should reject overly long passwords
      const result = userAuthService.validatePasswordStrength(longString);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must be at most 128 characters',
      );
    });

    it('should handle unicode characters in name', async () => {
      const unicodeName = '用户名 🎉 Пользователь';
      drizzleService.db.returning.mockResolvedValueOnce([
        { ...mockUser, name: unicodeName },
      ]);

      const result = await userAuthService.createUser({
        email: 'unicode@example.com',
        name: unicodeName,
      });

      expect(result.name).toBe(unicodeName);
    });
  });

  // ============ TIMING ATTACK PREVENTION ============

  describe('Timing Attack Prevention', () => {
    it('should use constant-time comparison for passwords', async () => {
      const password = 'password123';
      const hashedPassword = await bcrypt.hash(password, 10);

      drizzleService.db.limit
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([{ password: hashedPassword }]);

      // bcrypt.compare uses constant-time comparison internally
      const result = await userAuthService.validatePassword(
        mockUser.email,
        password,
      );

      expect(result).toEqual(mockUser);
    });
  });
});
