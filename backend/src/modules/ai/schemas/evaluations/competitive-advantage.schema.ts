import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const nullToUndefined = (value: unknown): unknown =>
  value === null ? undefined : value;

const optionalUrl = z.preprocess(
  nullToUndefined,
  z.string().url().optional(),
);

const optionalNonNegativeNumber = z.preprocess(
  nullToUndefined,
  z.number().nonnegative().optional(),
);

const optionalString = z.preprocess(
  nullToUndefined,
  z.string().min(1).optional(),
);

const optionalThreatLevel = z.preprocess(
  nullToUndefined,
  z.enum(["high", "medium", "low"]).optional(),
);

const CompetitiveDirectCompetitorSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  url: optionalUrl,
  fundingRaised: optionalNonNegativeNumber,
});

const CompetitiveIndirectCompetitorSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  whyIndirect: optionalString,
  url: optionalUrl,
  threatLevel: optionalThreatLevel,
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
