import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const CompetitiveDirectCompetitorSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url().optional(),
  fundingRaised: z.number().nonnegative().optional(),
});

const CompetitiveIndirectCompetitorSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  whyIndirect: z.string().min(1).optional(),
  url: z.string().url().optional(),
  threatLevel: z.enum(["high", "medium", "low"]).optional(),
});

export const CompetitiveAdvantageEvaluationSchema = BaseEvaluationSchema.extend(
  {
    moats: z.array(z.string()).default([]),
    competitivePosition: z.string().min(1),
    barriers: z.array(z.string()).default([]),
    directCompetitors: z.array(z.string()).default([]),
    indirectCompetitors: z.array(z.string()).default([]),
    directCompetitorsDetailed: z.array(CompetitiveDirectCompetitorSchema).default([]),
    indirectCompetitorsDetailed: z.array(CompetitiveIndirectCompetitorSchema).default([]),
  },
);

export type CompetitiveAdvantageEvaluation = z.infer<
  typeof CompetitiveAdvantageEvaluationSchema
>;
