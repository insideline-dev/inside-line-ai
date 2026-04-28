import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const SubmitWebsiteSchema = z.object({
  website: z.string().min(1).max(2048),
});

export type SubmitWebsite = z.infer<typeof SubmitWebsiteSchema>;
export class SubmitWebsiteDto extends createZodDto(SubmitWebsiteSchema) {}
