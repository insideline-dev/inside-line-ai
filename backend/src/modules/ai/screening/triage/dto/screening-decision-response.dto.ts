import { createZodDto } from "nestjs-zod";
import { ScreeningDecisionSchema } from "../screening-triage.service";

export class ScreeningDecisionResponseDto extends createZodDto(
  ScreeningDecisionSchema,
) {}
