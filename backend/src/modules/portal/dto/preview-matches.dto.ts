import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { StartupStage } from '../../startup/entities/startup.schema';

export const PreviewMatchesSchema = z.object({
  industry: z.string().min(1).max(200),
  stage: z.nativeEnum(StartupStage),
  location: z.string().min(1).max(200),
  fundingTarget: z.number().int().positive(),
});

export type PreviewMatches = z.infer<typeof PreviewMatchesSchema>;
export class PreviewMatchesDto extends createZodDto(PreviewMatchesSchema) {}

export interface PreviewMatchInvestor {
  id: string;
  fundName: string;
  thesisSummary: string | null;
  industries: string[];
  stages: string[];
  checkSizeMin: number | null;
  checkSizeMax: number | null;
  geographicFocus: string[];
}

export interface PreviewMatchesResult {
  investors: PreviewMatchInvestor[];
  totalCandidates: number;
}
