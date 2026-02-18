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

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value === null ? fallback : value),
    z.string().min(1),
  );

const stringArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  z.array(z.string()),
).default([]);

const CompetitiveDirectCompetitorSchema = z.object({
  name: requiredStringFromNull("Unknown competitor"),
  description: requiredStringFromNull("Description unavailable"),
  url: optionalUrl,
  fundingRaised: optionalNonNegativeNumber,
});

const CompetitiveIndirectCompetitorSchema = z.object({
  name: requiredStringFromNull("Unknown competitor"),
  description: requiredStringFromNull("Description unavailable"),
  whyIndirect: optionalString,
  url: optionalUrl,
  threatLevel: optionalThreatLevel,
});

export const CompetitiveAdvantageEvaluationSchema = BaseEvaluationSchema.extend(
  {
    moats: stringArray,
    competitivePosition: requiredStringFromNull("Competitive position requires manual review"),
    barriers: stringArray,
    directCompetitors: stringArray,
    indirectCompetitors: stringArray,
    directCompetitorsDetailed: z.array(CompetitiveDirectCompetitorSchema).default([]),
    indirectCompetitorsDetailed: z.array(CompetitiveIndirectCompetitorSchema).default([]),
  },
);

export type CompetitiveAdvantageEvaluation = z.infer<
  typeof CompetitiveAdvantageEvaluationSchema
>;
