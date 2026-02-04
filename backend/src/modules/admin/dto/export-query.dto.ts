import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserRole } from '../../../auth/entities/auth.schema';
import { StartupStatus } from '../../startup/entities/startup.schema';

export const ExportUsersQuerySchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
});

export type ExportUsersQuery = z.infer<typeof ExportUsersQuerySchema>;
export class ExportUsersQueryDto extends createZodDto(ExportUsersQuerySchema) {}

export const ExportStartupsQuerySchema = z.object({
  status: z.nativeEnum(StartupStatus).optional(),
});

export type ExportStartupsQuery = z.infer<typeof ExportStartupsQuerySchema>;
export class ExportStartupsQueryDto extends createZodDto(
  ExportStartupsQuerySchema,
) {}
