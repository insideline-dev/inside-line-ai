import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const slugSchema = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase, alphanumeric, and hyphens only');

export const brandColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be valid hex color (#RRGGBB)');

export const CreatePortalSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().min(1).max(1000),
  logoUrl: z.string().url().optional(),
  brandColor: brandColorSchema,
});

export type CreatePortal = z.infer<typeof CreatePortalSchema>;
export class CreatePortalDto extends createZodDto(CreatePortalSchema) {}
