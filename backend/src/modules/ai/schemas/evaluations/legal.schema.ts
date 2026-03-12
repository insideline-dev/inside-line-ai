import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";
import { FounderPitchRecommendationSchema } from "../simple-evaluation.schema";

const RedFlagSchema = z.object({
  flag: z.string().min(1).default("Unspecified flag"),
  source: z.string().min(1).default("Unknown source"),
  severity: z.enum(["critical", "notable", "minor"]).default("minor"),
});

const complianceCertificationsSchema = z.preprocess(
  (value) => {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  },
  z.array(z.string()),
).default([]);

export const LegalEvaluationSchema = BaseEvaluationSchema.extend({
  legalOverview: z.preprocess(
    (value) => value ?? {},
    z.object({
      redFlagsFound: z.boolean().default(false),
      redFlagCount: z.preprocess(
        (value) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0),
        z.number().int().min(0),
      ),
      redFlagDetails: z.array(RedFlagSchema).default([]),
      complianceCertifications: complianceCertificationsSchema,
      regulatoryOutlook: z.enum(["favorable", "neutral", "headwinds", "blocking"]).default("neutral"),
      ipVerified: z.preprocess(
        (value) => (typeof value === "boolean" ? value : null),
        z.boolean().nullable(),
      ).default(null),
    }),
  ),
  founderPitchRecommendations: z.array(FounderPitchRecommendationSchema).default([]),
});

export type LegalEvaluation = z.infer<typeof LegalEvaluationSchema>;
