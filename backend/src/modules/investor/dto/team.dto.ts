import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// ============================================================================
// REQUEST DTOS
// ============================================================================

export const CreateTeamInviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['member', 'admin']),
});

export type CreateTeamInvite = z.infer<typeof CreateTeamInviteSchema>;
export class CreateTeamInviteDto extends createZodDto(CreateTeamInviteSchema) {}

// ============================================================================
// RESPONSE DTOS
// ============================================================================

export const TeamInviteResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
  inviteCode: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export type TeamInviteResponse = z.infer<typeof TeamInviteResponseSchema>;

export const TeamMemberResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string(),
  role: z.string(),
  joinedAt: z.string(),
});

export type TeamMemberResponse = z.infer<typeof TeamMemberResponseSchema>;

export const GetTeamResponseSchema = z.object({
  invites: z.array(TeamInviteResponseSchema),
  members: z.array(TeamMemberResponseSchema),
});

export type GetTeamResponse = z.infer<typeof GetTeamResponseSchema>;
