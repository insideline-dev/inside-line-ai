import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateDataRoomPermissionsSchema = z.object({
  investorIds: z.array(z.string().uuid()).default([]),
});

export type UpdateDataRoomPermissions = z.infer<typeof UpdateDataRoomPermissionsSchema>;

export class UpdateDataRoomPermissionsDto extends createZodDto(
  UpdateDataRoomPermissionsSchema,
) {}
