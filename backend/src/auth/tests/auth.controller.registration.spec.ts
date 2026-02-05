import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { UserAuthService } from '../user-auth.service';
import { ProfileService } from '../profile.service';
import { EmailService } from '../../email/email.service';
import { ConflictException, BadRequestException } from '@nestjs/common';
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

describe('AuthController Registration', () => {
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

  describe('register', () => {
    it('should register a new user and set cookies', async () => {
      const res = createMockResponse() as Response;
      const dto = {
        email: 'new@example.com',
        password: 'StrongPass123!',
        name: 'New User',
      };

      authService.registerWithPassword = mock(() => Promise.resolve(mockUser));
      authService.generateTokens = mock(() => mockTokens);
      userAuthService.createEmailVerificationToken = mock(() =>
        Promise.resolve('verify-token'),
      );
      emailService.sendVerificationEmail = mock(() => Promise.resolve());

      const result = await controller.register(dto, res);

      expect(authService.registerWithPassword).toHaveBeenCalledWith(
        dto.email,
        dto.password,
        dto.name,
      );
      expect(userAuthService.createEmailVerificationToken).toHaveBeenCalledWith(
        dto.email,
      );
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        dto.email,
        'verify-token',
        dto.name,
      );
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw ConflictException for existing email', async () => {
      const res = createMockResponse() as Response;
      const dto = {
        email: 'existing@example.com',
        password: 'StrongPass123!',
        name: 'User',
      };

      authService.registerWithPassword = mock(() =>
        Promise.reject(new ConflictException('Email already registered')),
      );

      await expect(controller.register(dto, res)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException for weak password', async () => {
      const res = createMockResponse() as Response;
      const dto = { email: 'new@example.com', password: 'weak', name: 'User' };

      authService.registerWithPassword = mock(() =>
        Promise.reject(new BadRequestException(['Password too weak'])),
      );

      await expect(controller.register(dto, res)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
