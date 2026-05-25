import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const OverrideScreeningVerdictSchema = z.object({
  targetClassification: z.enum(["advance", "review", "reject"]),
  reason: z.string().trim().min(3),
  reasonCode: z.string().trim().min(1).optional(),
});

export class OverrideScreeningVerdictDto extends createZodDto(
  OverrideScreeningVerdictSchema,
) {}
