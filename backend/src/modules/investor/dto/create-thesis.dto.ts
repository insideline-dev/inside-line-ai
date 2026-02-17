import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const WebsiteSchema = z
  .string()
  .max(2048)
  .optional()
  .refine(
    (value) => {
      if (!value || value.trim().length === 0) {
        return true;
      }
      return z.string().url().safeParse(value).success;
    },
    { message: 'website must be a valid URL or empty' },
  );

export const CreateThesisSchema = z.object({
  industries: z.array(z.string()).optional(),
  stages: z.array(z.string()).optional(),
  checkSizeMin: z.number().int().positive().optional(),
  checkSizeMax: z.number().int().positive().optional(),
  minRevenue: z.number().int().min(0).optional().nullable(),
  geographicFocus: z.array(z.string()).optional(),
  geographicFocusNodes: z.array(z.string().min(1).max(100)).max(300).optional(),
  businessModels: z.array(z.string()).optional(),
  mustHaveFeatures: z.array(z.string()).optional(),
  dealBreakers: z.array(z.string()).optional(),
  notes: z.string().max(5000).optional(),
  thesisNarrative: z.string().max(10000).optional(),
  antiPortfolio: z.string().max(5000).optional(),
  website: WebsiteSchema,
  fundSize: z.number().min(0).optional().nullable(),
  minThesisFitScore: z.number().int().min(0).max(100).optional().nullable(),
  minStartupScore: z.number().int().min(0).max(100).optional().nullable(),
}).refine(
  (data) => {
    if (data.checkSizeMin && data.checkSizeMax) {
      return data.checkSizeMin <= data.checkSizeMax;
    }
    return true;
  },
  { message: 'checkSizeMin must be less than or equal to checkSizeMax' },
);

export type CreateThesis = z.infer<typeof CreateThesisSchema>;
export class CreateThesisDto extends createZodDto(CreateThesisSchema) {}
