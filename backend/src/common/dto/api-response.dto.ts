import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Paginated response wrapper
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(
  dataSchema: T,
) =>
  z.object({
    data: z.array(dataSchema),
    meta: z.object({
      total: z.number().int(),
      page: z.number().int(),
      limit: z.number().int(),
      totalPages: z.number().int(),
    }),
  });

// Success response wrapper
export const SuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

export class SuccessResponseDto extends createZodDto(SuccessResponseSchema) {}

// Error response (for documentation)
export const ErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string(),
  timestamp: z.iso.datetime(),
  path: z.string(),
});

export class ErrorResponseDto extends createZodDto(ErrorResponseSchema) {}
