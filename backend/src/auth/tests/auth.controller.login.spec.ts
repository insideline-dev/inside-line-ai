import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { UserAuthService } from '../user-auth.service';
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
} from './auth.test-utils';

describe('AuthController Login', () => {
  let controller: AuthController;
  let authService: any;
  let userAuthService: any;
  let emailService: any;

  beforeEach(async () => {
    authService = createMockAuthService();
    userAuthService = createMockUserAuthService();
    emailService = createMockEmailService();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UserAuthService, useValue: userAuthService },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      const res = createMockResponse() as Response;
      const dto = { email: 'test@example.com', password: 'password' };

      authService.validatePassword = mock(() => Promise.resolve(mockUser));
      authService.generateTokens = mock(() => mockTokens);

      const result = await controller.login(dto, res);

      expect(authService.validatePassword).toHaveBeenCalledWith(
        dto.email,
        dto.password,
      );
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      const res = createMockResponse() as Response;
      const dto = { email: 'test@example.com', password: 'wrong' };

      authService.validatePassword = mock(() => Promise.resolve(null));

      await expect(controller.login(dto, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
