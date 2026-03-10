import { z } from "zod";
import { BaseEvaluationSchema, requiredStringFromNull, stringArray } from "../base-evaluation.schema";
import { FounderPitchRecommendationSchema } from "../simple-evaluation.schema";

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

// --- Strategic Positioning ---

export const StrategicPositioningSchema = z.object({
  differentiation: requiredStringFromNull("Unknown"),
  uniqueValueProposition: requiredStringFromNull("Unknown"),
  differentiationType: z.enum([
    "technical", "data", "distribution", "regulatory",
    "network_effects", "switching_costs", "brand", "none",
  ]).default("none"),
  durability: z.enum(["strong", "moderate", "weak", "none"]).default("none"),
}).default({
  differentiation: "Unknown",
  uniqueValueProposition: "Unknown",
  differentiationType: "none",
  durability: "none",
});

// --- Moat Assessment ---

export const MoatAssessmentSchema = z.object({
  moatType: z.enum([
    "network_effects", "proprietary_data", "regulatory",
    "switching_costs", "scale", "IP", "brand", "none",
  ]).default("none"),
  moatStage: z.enum(["potential", "forming", "established", "deep", "dominant"]).default("potential"),
  moatEvidence: stringArray,
  selfReinforcing: z.boolean().default(false),
  timeToReplicate: requiredStringFromNull("Unknown"),
}).default({
  moatType: "none",
  moatStage: "potential",
  moatEvidence: [],
  selfReinforcing: false,
  timeToReplicate: "Unknown",
});

// --- Barriers to Entry ---

export const BarriersToEntrySchema = z.object({
  technical: z.boolean().default(false),
  capital: z.boolean().default(false),
  network: z.boolean().default(false),
  regulatory: z.boolean().default(false),
}).default({ technical: false, capital: false, network: false, regulatory: false });

// --- Competitive Position ---

export const CompetitivePositionSchema = z.object({
  currentGap: z.enum(["widening", "stable", "narrowing"]).default("stable"),
  gapEvidence: requiredStringFromNull("Unknown"),
  vulnerabilities: stringArray,
  defensibleAgainstFunded: z.boolean().default(false),
  defensibilityRationale: requiredStringFromNull("Unknown"),
}).default({
  currentGap: "stable",
  gapEvidence: "Unknown",
  vulnerabilities: [],
  defensibleAgainstFunded: false,
  defensibilityRationale: "Unknown",
});

// --- Competitors ---

const DirectCompetitorSchema = z.object({
  name: requiredStringFromNull("Unknown competitor"),
  description: requiredStringFromNull("Description unavailable"),
  url: optionalUrl,
  fundingRaised: optionalNonNegativeNumber,
});

const IndirectCompetitorSchema = z.object({
  name: requiredStringFromNull("Unknown competitor"),
  description: requiredStringFromNull("Description unavailable"),
  whyIndirect: optionalString,
  url: optionalUrl,
  threatLevel: optionalThreatLevel,
});

export const CompetitorsSchema = z.object({
  direct: z.array(DirectCompetitorSchema).default([]),
  indirect: z.array(IndirectCompetitorSchema).default([]),
  advantages: stringArray,
  risks: stringArray,
  details: stringArray,
}).default({ direct: [], indirect: [], advantages: [], risks: [], details: [] });

// --- Main Schema ---

export const CompetitiveAdvantageEvaluationSchema = BaseEvaluationSchema.extend({
  strategicPositioning: StrategicPositioningSchema,
  moatAssessment: MoatAssessmentSchema,
  barriersToEntry: BarriersToEntrySchema,
  competitivePosition: CompetitivePositionSchema,
  competitors: CompetitorsSchema,
  strengths: stringArray,
  founderPitchRecommendations: z.array(FounderPitchRecommendationSchema).default([]),
});

export type CompetitiveAdvantageEvaluation = z.infer<
  typeof CompetitiveAdvantageEvaluationSchema
>;
