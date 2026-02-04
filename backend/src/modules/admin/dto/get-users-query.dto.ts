import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserRole } from '../../../auth/entities/auth.schema';

export const GetUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  role: z.nativeEnum(UserRole).optional(),
  search: z.string().optional(),
});

export type GetUsersQuery = z.infer<typeof GetUsersQuerySchema>;
export class GetUsersQueryDto extends createZodDto(GetUsersQuerySchema) {}
