import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { OPEN_QUESTION_STATUSES } from "../entities/open-question.schema";

export const UpdateOpenQuestionSchema = z.object({
  status: z.enum(OPEN_QUESTION_STATUSES).optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
});

export class UpdateOpenQuestionDto extends createZodDto(UpdateOpenQuestionSchema) {}
