import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value == null ? fallback : value),
    z.string().min(1),
  );

const stringArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  z.array(z.string()),
).default([]);

export const TeamMemberEvaluationSchema = z.object({
  name: requiredStringFromNull("Unknown member"),
  role: requiredStringFromNull("Unknown role"),
  background: requiredStringFromNull("Background unavailable"),
  strengths: stringArray,
  concerns: stringArray,
});

export const TeamEvaluationSchema = BaseEvaluationSchema.extend({
  founderQuality: requiredStringFromNull("Founder quality requires manual review"),
  teamCompletion: z.number().int().min(0).max(100),
  executionCapability: requiredStringFromNull("Execution capability requires manual review"),
  founderMarketFitScore: z.number().int().min(0).max(100),
  teamMembers: z.array(TeamMemberEvaluationSchema).default([]),
});

export type TeamEvaluation = z.infer<typeof TeamEvaluationSchema>;
