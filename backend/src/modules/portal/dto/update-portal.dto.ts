import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { brandColorSchema, slugSchema } from './create-portal.dto';
import { PortalLinkIntegrity } from '../entities';

export const UpdatePortalSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: slugSchema.optional(),
  description: z.string().min(1).max(1000).optional(),
  logoUrl: z.string().url().optional(),
  brandColor: brandColorSchema.optional(),
  isActive: z.boolean().optional(),
  /**
   * Abuse-prevention posture. Admins can flip a portal between strict and
   * lenient to allow re-submission for legitimate edge cases.
   */
  linkIntegrity: z.nativeEnum(PortalLinkIntegrity).optional(),
});

export type UpdatePortal = z.infer<typeof UpdatePortalSchema>;
export class UpdatePortalDto extends createZodDto(UpdatePortalSchema) {}
