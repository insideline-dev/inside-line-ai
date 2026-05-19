import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const ParseDealbreakersSchema = z.object({
  narrative: z.string().min(1).max(8000),
});

export class ParseDealbreakersDto extends createZodDto(ParseDealbreakersSchema) {}
