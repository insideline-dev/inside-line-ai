export type UserRole = "founder" | "investor" | "admin" | "scout";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  image: string | null;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

// Request DTOs (match backend)
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface MagicLinkRequest {
  email: string;
}

export interface MagicLinkVerifyRequest {
  token: string;
}

export interface EmailVerifyRequest {
  token: string;
}

export interface ResendVerificationRequest {
  email: string;
}

// Response DTOs
export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface MessageResponse {
  message: string;
  _devToken?: string; // Only in dev mode
}
