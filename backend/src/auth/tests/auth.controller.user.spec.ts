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

describe('AuthController User Management', () => {
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

  describe('refresh', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const res = createMockResponse() as Response;
      const req = {
        cookies: { refresh_token: 'valid-refresh-token' },
      } as any;

      authService.refreshTokens = mock(() =>
        Promise.resolve({ ...mockTokens, user: mockUser }),
      );

      const result = await controller.refresh(req, res);

      expect(authService.refreshTokens).toHaveBeenCalledWith(
        'valid-refresh-token',
      );
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedException if no refresh token', async () => {
      const res = createMockResponse() as Response;
      const req = { cookies: {} } as any;

      await expect(controller.refresh(req, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should clear cookies and return success message', async () => {
      const res = createMockResponse() as Response;

      authService.revokeAllUserTokens = mock(() => Promise.resolve());

      const result = await controller.logout(mockUser, res);

      expect(authService.revokeAllUserTokens).toHaveBeenCalledWith(mockUser.id);
      expect(res.clearCookie).toHaveBeenCalledWith('access_token');
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token');
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('getMe', () => {
    it('should return sanitized user data', () => {
      const result = controller.getMe(mockUser);

      expect(result).toHaveProperty('id', mockUser.id);
      expect(result).toHaveProperty('email', mockUser.email);
      expect(result).toHaveProperty('name', mockUser.name);
      expect(result).toHaveProperty('emailVerified', mockUser.emailVerified);
      expect(result).toHaveProperty('role', mockUser.role);
      expect(result).toHaveProperty('createdAt');
      expect(result).not.toHaveProperty('updatedAt');
    });
  });

  describe('cookie security', () => {
    it('should set httpOnly cookies', async () => {
      const res = createMockResponse() as Response;
      const dto = { email: 'test@example.com', password: 'password' };

      authService.validatePassword = mock(() => Promise.resolve(mockUser));
      authService.generateTokens = mock(() => mockTokens);

      await controller.login(dto, res);

      expect(res.cookie).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
    });
  });
});
