import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/**
 * Update User Profile Details DTO
 * Validation for extended profile information updates
 */
export const UpdateUserProfileDetailsSchema = z.object({
  companyName: z.string().max(255).optional(),
  title: z.string().max(255).optional(),
  linkedinUrl: z.string().url().optional(),
  bio: z.string().max(2000).optional(),
});

export type UpdateUserProfileDetails = z.infer<
  typeof UpdateUserProfileDetailsSchema
>;
export class UpdateUserProfileDetailsDto extends createZodDto(
  UpdateUserProfileDetailsSchema,
) {}

/**
 * User Profile Response
 */
export const UserProfileSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  companyName: z.string().nullable(),
  title: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  bio: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
export class UserProfileDto extends createZodDto(UserProfileSchema) {}
