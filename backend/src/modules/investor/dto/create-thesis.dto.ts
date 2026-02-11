import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateThesisSchema = z.object({
  industries: z.array(z.string()).optional(),
  stages: z.array(z.string()).optional(),
  checkSizeMin: z.number().int().positive().optional(),
  checkSizeMax: z.number().int().positive().optional(),
  geographicFocus: z.array(z.string()).optional(),
  geographicFocusNodes: z.array(z.string().min(1).max(100)).max(300).optional(),
  mustHaveFeatures: z.array(z.string()).optional(),
  dealBreakers: z.array(z.string()).optional(),
  notes: z.string().max(5000).optional(),
  thesisNarrative: z.string().max(10000).optional(),
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
