import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { UserRole } from "../entities/auth.schema";

// Explicit User type matching the database schema
export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  role: z.nativeEnum(UserRole),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type User = z.infer<typeof UserSchema>;
export class UserDto extends createZodDto(UserSchema) {}

// Public user response (no updatedAt)
export const UserResponseSchema = UserSchema.omit({ updatedAt: true });
export type UserResponse = z.infer<typeof UserResponseSchema>;
export class UserResponseDto extends createZodDto(UserResponseSchema) {}

// Password schema - simplified for better UX while maintaining security
const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

// Login request (less strict - just check length for existing passwords)
export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type Login = z.infer<typeof LoginSchema>;
export class LoginDto extends createZodDto(LoginSchema) {}

// Register request (strict password validation)
export const RegisterSchema = z.object({
  email: z.email(),
  password: PasswordSchema,
  name: z.string().min(1).max(100),
});
export type Register = z.infer<typeof RegisterSchema>;
export class RegisterDto extends createZodDto(RegisterSchema) {}

// Magic link request
export const MagicLinkRequestSchema = z.object({
  email: z.email(),
});
export type MagicLinkRequest = z.infer<typeof MagicLinkRequestSchema>;
export class MagicLinkRequestDto extends createZodDto(MagicLinkRequestSchema) {}

// Magic link verify (32 char hex token)
export const MagicLinkVerifySchema = z.object({
  token: z
    .string()
    .length(32)
    .regex(/^[a-f0-9]+$/),
});
export type MagicLinkVerify = z.infer<typeof MagicLinkVerifySchema>;
export class MagicLinkVerifyDto extends createZodDto(MagicLinkVerifySchema) {}

// Email verification (same token format as magic link)
export const EmailVerifySchema = z.object({
  token: z
    .string()
    .length(32)
    .regex(/^[a-f0-9]+$/),
});
export type EmailVerify = z.infer<typeof EmailVerifySchema>;
export class EmailVerifyDto extends createZodDto(EmailVerifySchema) {}

// Resend verification email
export const ResendVerificationSchema = z.object({
  email: z.email(),
});
export type ResendVerification = z.infer<typeof ResendVerificationSchema>;
export class ResendVerificationDto extends createZodDto(
  ResendVerificationSchema,
) {}

// Auth response with tokens
export const AuthResponseSchema = z.object({
  user: UserResponseSchema,
  accessToken: z.string(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export class AuthResponseDto extends createZodDto(AuthResponseSchema) {}

/**
 * SECURITY: Update profile DTO
 * NOTE: This DTO INTENTIONALLY excludes 'role' field
 * Role changes MUST only be done via /admin/promote or /admin/demote endpoints
 * If you need to update this DTO, NEVER add the 'role' field to it
 */
export const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  image: z.string().optional().nullable(),
  // NOTE: role field is intentionally omitted for security
});
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;
export class UpdateProfileDto extends createZodDto(UpdateProfileSchema) {}
