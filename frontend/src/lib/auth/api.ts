import { customFetch } from "@/api/client";
import { env } from "@/env";
import type {
  AuthResponse,
  MagicLinkRequest,
  EmailVerifyRequest,
  ResendVerificationRequest,
  JoinWaitlistRequest,
  RedeemInviteRequest,
  RedeemInviteResponse,
  User,
  MessageResponse,
} from "./types";

export const authApi = {
  // Magic Link
  requestMagicLink: (data: MagicLinkRequest) =>
    customFetch<MessageResponse>("/auth/magic-link/request", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  verifyMagicLink: (token: string) =>
    customFetch<AuthResponse>("/auth/magic-link/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  redeemInvite: (data: RedeemInviteRequest) =>
    customFetch<RedeemInviteResponse>("/auth/invite/redeem", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  joinWaitlist: (data: JoinWaitlistRequest) =>
    customFetch<MessageResponse>("/auth/waitlist", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Google OAuth (redirect-based)
  getGoogleAuthUrl: () => `${env.VITE_API_BASE_URL}/auth/google`,

  // Onboarding
  selectRole: (role: "founder" | "investor") =>
    customFetch<AuthResponse>("/auth/select-role", {
      method: "POST",
      body: JSON.stringify({ role }),
    }),

  // Session
  getCurrentUser: () => customFetch<User>("/auth/me"),
  logout: () => customFetch<MessageResponse>("/auth/logout", { method: "POST" }),
  logoutAll: () =>
    customFetch<MessageResponse>("/auth/logout-all", { method: "POST" }),
  refresh: () =>
    customFetch<AuthResponse>("/auth/refresh", { method: "POST" }),

  // Email verification
  verifyEmail: (data: EmailVerifyRequest) =>
    customFetch<AuthResponse>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  resendVerification: (data: ResendVerificationRequest) =>
    customFetch<MessageResponse>("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
