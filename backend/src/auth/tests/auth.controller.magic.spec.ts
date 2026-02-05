import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { UserAuthService } from '../user-auth.service';
import { ProfileService } from '../profile.service';
import { EmailService } from '../../email/email.service';
import { UnauthorizedException } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Response } from 'express';
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import {
  mockUser,
  mockTokens,
  createMockResponse,
  createMockAuthService,
  createMockUserAuthService,
  createMockEmailService,
  createMockProfileService,
} from './auth.test-utils';

describe('AuthController Magic Link', () => {
  let controller: AuthController;
  let authService: any;
  let userAuthService: any;
  let emailService: any;
  let profileService: any;

  beforeEach(async () => {
    authService = createMockAuthService();
    userAuthService = createMockUserAuthService();
    emailService = createMockEmailService();
    profileService = createMockProfileService();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UserAuthService, useValue: userAuthService },
        { provide: ProfileService, useValue: profileService },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('requestMagicLink', () => {
    it('should create magic link and return success message', async () => {
      const dto = { email: 'test@example.com' };
      const token = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

      authService.createMagicLink = mock(() => Promise.resolve(token));
      emailService.sendMagicLinkEmail = mock(() => Promise.resolve());

      const result = await controller.requestMagicLink(dto);

      expect(authService.createMagicLink).toHaveBeenCalledWith(dto.email);
      expect(emailService.sendMagicLinkEmail).toHaveBeenCalledWith(
        dto.email,
        token,
      );
      expect(result).toHaveProperty('message', 'Magic link sent to your email');
    });

    it('should include dev token in non-production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const dto = { email: 'test@example.com' };
      const token = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

      authService.createMagicLink = mock(() => Promise.resolve(token));
      emailService.sendMagicLinkEmail = mock(() => Promise.resolve());

      const result = await controller.requestMagicLink(dto);

      expect(result._devToken).toBe(token);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('verifyMagicLink', () => {
    it('should verify magic link and return tokens', async () => {
      const res = createMockResponse() as Response;
      const dto = { token: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4' };

      authService.validateMagicLink = mock(() => Promise.resolve(mockUser));
      authService.generateTokens = mock(() => mockTokens);

      const result = await controller.verifyMagicLink(dto, res);

      expect(authService.validateMagicLink).toHaveBeenCalledWith(dto.token);
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const res = createMockResponse() as Response;
      const dto = { token: 'invalid-token' };

      authService.validateMagicLink = mock(() => Promise.resolve(null));

      await expect(controller.verifyMagicLink(dto, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
