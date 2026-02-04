import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserRole } from '../../../auth/entities/auth.schema';

export const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(UserRole).optional(),
});

export type UpdateUser = z.infer<typeof UpdateUserSchema>;
export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
