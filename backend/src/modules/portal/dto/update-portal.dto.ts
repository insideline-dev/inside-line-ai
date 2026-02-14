import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { brandColorSchema, slugSchema } from './create-portal.dto';

export const UpdatePortalSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: slugSchema.optional(),
  description: z.string().min(1).max(1000).optional(),
  logoUrl: z.string().url().optional(),
  brandColor: brandColorSchema.optional(),
  isActive: z.boolean().optional(),
});

export type UpdatePortal = z.infer<typeof UpdatePortalSchema>;
export class UpdatePortalDto extends createZodDto(UpdatePortalSchema) {}
