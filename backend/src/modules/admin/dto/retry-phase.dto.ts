import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { PipelinePhase } from "../../ai/interfaces/pipeline.interface";

export const RetryPhaseSchema = z.object({
  phase: z.nativeEnum(PipelinePhase),
  forceRerun: z.boolean().optional().default(false),
  feedback: z.string().trim().min(10).max(3000).optional(),
});

export type RetryPhase = z.infer<typeof RetryPhaseSchema>;

export class RetryPhaseDto extends createZodDto(RetryPhaseSchema) {}
