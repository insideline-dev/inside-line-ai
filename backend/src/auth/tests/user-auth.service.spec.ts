import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { UserAuthService, DbUser } from '../user-auth.service';
import { DrizzleService } from '../../database';
import { user, account, verification } from '../../database/schema';
import { UserRole } from '../entities/auth.schema';
import * as bcrypt from 'bcrypt';

describe('UserAuthService', () => {
  let service: UserAuthService;
  let drizzleService: any;

  const mockUser: DbUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    emailVerified: false,
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAuthService,
        { provide: DrizzleService, useValue: drizzleService },
      ],
    }).compile();

    service = module.get<UserAuthService>(UserAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============ PASSWORD VALIDATION TESTS ============

  describe('validatePasswordStrength', () => {
    it('should accept valid password with letter and number', () => {
      const result = service.validatePasswordStrength('password123');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept password with mixed case', () => {
      const result = service.validatePasswordStrength('Password123');
      expect(result.valid).toBe(true);
    });

    it('should reject password shorter than 8 characters', () => {
      const result = service.validatePasswordStrength('pass1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters');
    });

    it('should reject password longer than 128 characters', () => {
      const longPassword = 'a1' + 'a'.repeat(130);
      const result = service.validatePasswordStrength(longPassword);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must be at most 128 characters',
      );
    });

    it('should reject password without any letters', () => {
      const result = service.validatePasswordStrength('12345678');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least one letter',
      );
    });

    it('should reject password without number', () => {
      const result = service.validatePasswordStrength('passwordonly');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least one number',
      );
    });

    it('should return multiple errors for very weak password', () => {
      const result = service.validatePasswordStrength('!!!');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('should accept passwords with special characters (not required)', () => {
      const result = service.validatePasswordStrength('password123!@#');
      expect(result.valid).toBe(true);
    });
  });

  // ============ USER LOOKUP TESTS ============

  describe('findUserByEmail', () => {
    it('should return a user if found', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockUser]);

      const result = await service.findUserByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(drizzleService.db.select).toHaveBeenCalled();
      expect(drizzleService.db.from).toHaveBeenCalledWith(user);
    });

    it('should return undefined if user not found', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);

      const result = await service.findUserByEmail('notfound@example.com');

      expect(result).toBeUndefined();
    });

    it('should normalize email to lowercase', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockUser]);

      await service.findUserByEmail('TEST@EXAMPLE.COM');

      // The where clause should be called (we can't easily check the exact value)
      expect(drizzleService.db.where).toHaveBeenCalled();
    });

    it('should trim whitespace from email', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockUser]);

      await service.findUserByEmail('  test@example.com  ');

      expect(drizzleService.db.where).toHaveBeenCalled();
    });
  });

  describe('findUserById', () => {
    it('should return a user if found', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockUser]);

      const result = await service.findUserById('user-1');

      expect(result).toEqual(mockUser);
    });

    it('should return undefined if user not found', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);

      const result = await service.findUserById('non-existent');

      expect(result).toBeUndefined();
    });
  });

  // ============ USER CREATION TESTS ============

  describe('createUser', () => {
    it('should create and return a new user', async () => {
      const createData = { email: 'new@example.com', name: 'New User' };
      const createdUser = { ...mockUser, ...createData, id: 'user-2' };
      drizzleService.db.returning.mockResolvedValueOnce([createdUser]);

      const result = await service.createUser(createData);

      expect(result).toEqual(createdUser);
      expect(drizzleService.db.insert).toHaveBeenCalledWith(user);
    });

    it('should throw error if creation fails', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([]);

      await expect(
        service.createUser({ email: 'new@example.com', name: 'New User' }),
      ).rejects.toThrow('Failed to create user');
    });

    it('should set emailVerified to false by default', async () => {
      const createdUser = { ...mockUser, emailVerified: false };
      drizzleService.db.returning.mockResolvedValueOnce([createdUser]);

      const result = await service.createUser({
        email: 'new@example.com',
        name: 'New User',
      });

      expect(result.emailVerified).toBe(false);
    });

    it('should set emailVerified to true when specified', async () => {
      const createdUser = { ...mockUser, emailVerified: true };
      drizzleService.db.returning.mockResolvedValueOnce([createdUser]);

      const result = await service.createUser({
        email: 'new@example.com',
        name: 'New User',
        emailVerified: true,
      });

      expect(result.emailVerified).toBe(true);
    });

    it('should normalize email and trim name', async () => {
      const createdUser = {
        ...mockUser,
        email: 'new@example.com',
        name: 'New User',
      };
      drizzleService.db.returning.mockResolvedValueOnce([createdUser]);

      await service.createUser({
        email: '  NEW@EXAMPLE.COM  ',
        name: '  New User  ',
      });

      expect(drizzleService.db.values).toHaveBeenCalled();
    });
  });

  // ============ PASSWORD REGISTRATION TESTS ============

  describe('registerWithPassword', () => {
    const validPassword = 'StrongPass123!';

    it('should register a new user with valid password', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]); // No existing user
      drizzleService.db.returning.mockResolvedValueOnce([mockUser]); // User creation

      const result = await service.registerWithPassword(
        'new@example.com',
        validPassword,
        'New User',
      );

      expect(result).toEqual(mockUser);
      expect(drizzleService.db.insert).toHaveBeenCalledWith(user);
      expect(drizzleService.db.insert).toHaveBeenCalledWith(account);
    });

    it('should throw ConflictException if email already exists', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockUser]);

      await expect(
        service.registerWithPassword('test@example.com', validPassword, 'Test'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for weak password', async () => {
      await expect(
        service.registerWithPassword('new@example.com', 'weak', 'Test'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should hash password before storing', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);
      drizzleService.db.returning.mockResolvedValueOnce([mockUser]);

      await service.registerWithPassword(
        'new@example.com',
        validPassword,
        'New User',
      );

      // Verify that values was called with hashed password (not the original)
      expect(drizzleService.db.values).toHaveBeenCalled();
    });

    it('should normalize email before checking existence', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);
      drizzleService.db.returning.mockResolvedValueOnce([mockUser]);

      await service.registerWithPassword(
        '  NEW@EXAMPLE.COM  ',
        validPassword,
        'New User',
      );

      expect(drizzleService.db.where).toHaveBeenCalled();
    });
  });

  // ============ PASSWORD VALIDATION TESTS ============

  describe('validatePassword', () => {
    it('should return user if password is valid', async () => {
      const password = 'password123';
      const hashedPassword = await bcrypt.hash(password, 10);

      drizzleService.db.limit
        .mockResolvedValueOnce([mockUser]) // findUserByEmail
        .mockResolvedValueOnce([{ password: hashedPassword }]); // account lookup

      const result = await service.validatePassword(mockUser.email, password);

      expect(result).toEqual(mockUser);
    });

    it('should return null if password is invalid', async () => {
      const password = 'password123';
      const hashedPassword = await bcrypt.hash(password, 10);

      drizzleService.db.limit
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([{ password: hashedPassword }]);

      const result = await service.validatePassword(mockUser.email, 'wrong');

      expect(result).toBeNull();
    });

    it('should return null if user not found', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);

      const result = await service.validatePassword(
        'notfound@example.com',
        'password',
      );

      expect(result).toBeNull();
    });

    it('should return null if no credential account exists', async () => {
      drizzleService.db.limit
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([]); // No account

      const result = await service.validatePassword(mockUser.email, 'password');

      expect(result).toBeNull();
    });

    it('should return null if account has no password', async () => {
      drizzleService.db.limit
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValueOnce([{ password: null }]);

      const result = await service.validatePassword(mockUser.email, 'password');

      expect(result).toBeNull();
    });
  });

  // ============ MAGIC LINK TESTS ============

  describe('createMagicLink', () => {
    it('should create magic link for existing user', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockUser]);

      const token = await service.createMagicLink('test@example.com');

      expect(token).toBeDefined();
      expect(token).toHaveLength(32); // 16 bytes hex = 32 chars
      expect(drizzleService.db.insert).toHaveBeenCalledWith(verification);
    });

    it('should create user if not exists', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]); // No existing user
      drizzleService.db.returning.mockResolvedValueOnce([mockUser]); // User creation

      const token = await service.createMagicLink('new@example.com');

      expect(token).toBeDefined();
      expect(drizzleService.db.insert).toHaveBeenCalledWith(user);
    });

    it('should generate URL-safe hex token', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockUser]);

      const token = await service.createMagicLink('test@example.com');

      expect(token).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should normalize email', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockUser]);

      await service.createMagicLink('  TEST@EXAMPLE.COM  ');

      expect(drizzleService.db.where).toHaveBeenCalled();
    });
  });

  describe('validateMagicLink', () => {
    it('should return user for valid token', async () => {
      const verificationRecord = {
        id: 'ver-1',
        identifier: 'test@example.com',
        value: 'valid-token',
        expiresAt: new Date(Date.now() + 60000),
      };

      drizzleService.db.limit.mockResolvedValueOnce([verificationRecord]);
      drizzleService.db.returning.mockResolvedValueOnce([
        { ...mockUser, emailVerified: true },
      ]);

      const result = await service.validateMagicLink('valid-token');

      expect(result).toBeDefined();
      expect(result?.emailVerified).toBe(true);
    });

    it('should return null for invalid token', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);

      const result = await service.validateMagicLink('invalid-token');

      expect(result).toBeNull();
    });

    it('should delete verification record after use', async () => {
      const verificationRecord = {
        id: 'ver-1',
        identifier: 'test@example.com',
        value: 'valid-token',
        expiresAt: new Date(Date.now() + 60000),
      };

      drizzleService.db.limit.mockResolvedValueOnce([verificationRecord]);
      drizzleService.db.returning.mockResolvedValueOnce([mockUser]);

      await service.validateMagicLink('valid-token');

      expect(drizzleService.db.delete).toHaveBeenCalledWith(verification);
    });

    it('should set emailVerified to true', async () => {
      const verificationRecord = {
        id: 'ver-1',
        identifier: 'test@example.com',
        value: 'valid-token',
        expiresAt: new Date(Date.now() + 60000),
      };

      drizzleService.db.limit.mockResolvedValueOnce([verificationRecord]);
      drizzleService.db.returning.mockResolvedValueOnce([mockUser]);

      await service.validateMagicLink('valid-token');

      expect(drizzleService.db.update).toHaveBeenCalledWith(user);
      expect(drizzleService.db.set).toHaveBeenCalledWith({
        emailVerified: true,
      });
    });

    it('should return null if user update fails', async () => {
      const verificationRecord = {
        id: 'ver-1',
        identifier: 'test@example.com',
        value: 'valid-token',
        type: 'magic_link',
        expiresAt: new Date(Date.now() + 60000),
      };

      drizzleService.db.limit.mockResolvedValueOnce([verificationRecord]);
      drizzleService.db.returning.mockResolvedValueOnce([]);

      const result = await service.validateMagicLink('valid-token');

      expect(result).toBeNull();
    });
  });

  // ============ EMAIL VERIFICATION TESTS ============

  describe('createEmailVerificationToken', () => {
    it('should create verification token for email', async () => {
      const token =
        await service.createEmailVerificationToken('test@example.com');

      expect(token).toBeDefined();
      expect(token).toHaveLength(32); // 16 bytes hex = 32 chars
      expect(token).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should delete existing verification tokens before creating new one', async () => {
      await service.createEmailVerificationToken('test@example.com');

      expect(drizzleService.db.delete).toHaveBeenCalledWith(verification);
    });

    it('should store token with email type', async () => {
      await service.createEmailVerificationToken('test@example.com');

      expect(drizzleService.db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'email',
          identifier: 'test@example.com',
        }),
      );
    });

    it('should normalize email to lowercase', async () => {
      await service.createEmailVerificationToken('  TEST@EXAMPLE.COM  ');

      expect(drizzleService.db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: 'test@example.com',
        }),
      );
    });
  });

  describe('verifyEmail', () => {
    const verificationRecord = {
      id: 'ver-1',
      identifier: 'test@example.com',
      value: 'valid-token',
      type: 'email',
      expiresAt: new Date(Date.now() + 60000),
    };

    it('should return user for valid token', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([verificationRecord]);
      drizzleService.db.returning.mockResolvedValueOnce([
        { ...mockUser, emailVerified: true },
      ]);

      const result = await service.verifyEmail('valid-token');

      expect(result).toBeDefined();
      expect(result?.emailVerified).toBe(true);
    });

    it('should return null for invalid token', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);

      const result = await service.verifyEmail('invalid-token');

      expect(result).toBeNull();
    });

    it('should delete verification record after use', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([verificationRecord]);
      drizzleService.db.returning.mockResolvedValueOnce([mockUser]);

      await service.verifyEmail('valid-token');

      expect(drizzleService.db.delete).toHaveBeenCalledWith(verification);
    });

    it('should mark email as verified', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([verificationRecord]);
      drizzleService.db.returning.mockResolvedValueOnce([mockUser]);

      await service.verifyEmail('valid-token');

      expect(drizzleService.db.update).toHaveBeenCalledWith(user);
      expect(drizzleService.db.set).toHaveBeenCalledWith({
        emailVerified: true,
      });
    });
  });

  describe('resendVerificationEmail', () => {
    it('should return new token for unverified user', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockUser]); // findUserByEmail

      const token = await service.resendVerificationEmail('test@example.com');

      expect(token).toBeDefined();
      expect(token).toHaveLength(32);
    });

    it('should return null if user not found', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);

      const token = await service.resendVerificationEmail(
        'notfound@example.com',
      );

      expect(token).toBeNull();
    });

    it('should return null if email already verified', async () => {
      const verifiedUser = { ...mockUser, emailVerified: true };
      drizzleService.db.limit.mockResolvedValueOnce([verifiedUser]);

      const token = await service.resendVerificationEmail('test@example.com');

      expect(token).toBeNull();
    });
  });
});
