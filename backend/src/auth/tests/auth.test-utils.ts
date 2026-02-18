import { mock } from 'bun:test';
import type { DbUser } from '../user-auth.service';
import type { Response } from 'express';
import { UserRole } from '../entities/auth.schema';

export const mockUser: DbUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  image: null,
  emailVerified: true,
  role: UserRole.FOUNDER,
  onboardingCompleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const mockTokens = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
};

export const createMockResponse = (): Partial<Response> => {
  const res: any = {
    cookie: mock(() => res),
    clearCookie: mock(() => res),
    status: mock(() => res),
    json: mock(() => res),
    redirect: mock(() => res),
  };
  return res;
};

export const createMockAuthService = () => ({
  registerWithPassword: mock(() => Promise.resolve(mockUser)),
  validatePassword: mock(() => Promise.resolve(mockUser)),
  createMagicLink: mock(() => Promise.resolve('magic-token')),
  validateMagicLink: mock(() => Promise.resolve(mockUser)),
  generateTokens: mock(() => mockTokens),
  refreshTokens: mock(() => Promise.resolve({ ...mockTokens, user: mockUser })),
  findUserById: mock(() => Promise.resolve(mockUser)),
  revokeAllUserTokens: mock(() => Promise.resolve()),
});

export const createMockUserAuthService = () => ({
  findUserById: mock(() => Promise.resolve(mockUser)),
  createEmailVerificationToken: mock(() => Promise.resolve('verify-token')),
  verifyEmail: mock(() => Promise.resolve(mockUser)),
  resendVerificationEmail: mock(() => Promise.resolve('verify-token')),
  updateUserRole: mock(() => Promise.resolve({ ...mockUser, onboardingCompleted: true })),
});

export const createMockEmailService = () => ({
  sendVerificationEmail: mock(() => Promise.resolve()),
  sendWelcomeEmail: mock(() => Promise.resolve()),
  sendMagicLinkEmail: mock(() => Promise.resolve()),
});

export const mockUserProfile = {
  id: 'profile-1',
  userId: mockUser.id,
  companyName: null,
  title: null,
  linkedinUrl: null,
  bio: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const createMockProfileService = () => ({
  getProfile: mock(() => Promise.resolve(mockUserProfile)),
  updateProfile: mock(() => Promise.resolve(mockUserProfile)),
});

export const createMockEarlyAccessService = () => ({
  assertEmailAllowed: mock(() => Promise.resolve()),
  isEmailAllowed: mock(() => Promise.resolve(true)),
  joinWaitlist: mock(() => Promise.resolve()),
  redeemInviteToken: mock(() => Promise.resolve({ message: 'ok', email: 'test@example.com' })),
  bindRedeemedInviteToUser: mock(() => Promise.resolve()),
  addFounderFromGoogleAttempt: mock(() => Promise.resolve()),
});
