import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreateEarlyAccessInviteSchema = z.object({
  email: z.email(),
  expiresInDays: z.coerce.number().int().min(1).max(90).optional().default(7),
});
export type CreateEarlyAccessInvite = z.infer<typeof CreateEarlyAccessInviteSchema>;
export class CreateEarlyAccessInviteDto extends createZodDto(
  CreateEarlyAccessInviteSchema,
) {}

export const RedeemEarlyAccessInviteSchema = z.object({
  token: z.string().min(20).max(256),
});
export type RedeemEarlyAccessInvite = z.infer<typeof RedeemEarlyAccessInviteSchema>;
export class RedeemEarlyAccessInviteDto extends createZodDto(
  RedeemEarlyAccessInviteSchema,
) {}

export const JoinWaitlistSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.email(),
  companyName: z.string().min(1).max(180),
  role: z.string().min(1).max(120),
  website: z.string().url().max(500),
});
export type JoinWaitlist = z.infer<typeof JoinWaitlistSchema>;
export class JoinWaitlistDto extends createZodDto(JoinWaitlistSchema) {}

export const EarlyAccessInviteResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  status: z.enum(["pending", "redeemed", "revoked", "expired"]),
  expiresAt: z.iso.datetime(),
  redeemedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  inviteUrl: z.string().url().optional(),
});
export type EarlyAccessInviteResponse = z.infer<typeof EarlyAccessInviteResponseSchema>;
export class EarlyAccessInviteResponseDto extends createZodDto(
  EarlyAccessInviteResponseSchema,
) {}

export const WaitlistEntryResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  companyName: z.string(),
  role: z.string(),
  website: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type WaitlistEntryResponse = z.infer<typeof WaitlistEntryResponseSchema>;
export class WaitlistEntryResponseDto extends createZodDto(
  WaitlistEntryResponseSchema,
) {}

export const RedeemInviteResponseSchema = z.object({
  message: z.string(),
  email: z.email(),
});
export type RedeemInviteResponse = z.infer<typeof RedeemInviteResponseSchema>;
export class RedeemInviteResponseDto extends createZodDto(
  RedeemInviteResponseSchema,
) {}
