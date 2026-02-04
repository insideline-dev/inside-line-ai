import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { StartupStatus, StartupStage } from '../entities/startup.schema';

export const GetStartupsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.nativeEnum(StartupStatus).optional(),
  industry: z.string().optional(),
  stage: z.nativeEnum(StartupStage).optional(),
  search: z.string().optional(),
});

export type GetStartupsQuery = z.infer<typeof GetStartupsQuerySchema>;
export class GetStartupsQueryDto extends createZodDto(GetStartupsQuerySchema) {}

export const GetApprovedStartupsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  industry: z.string().optional(),
  stage: z.nativeEnum(StartupStage).optional(),
  location: z.string().optional(),
  search: z.string().optional(),
});

export type GetApprovedStartupsQuery = z.infer<
  typeof GetApprovedStartupsQuerySchema
>;
export class GetApprovedStartupsQueryDto extends createZodDto(
  GetApprovedStartupsQuerySchema,
) {}
