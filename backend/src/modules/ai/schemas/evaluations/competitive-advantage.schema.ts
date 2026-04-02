import { z } from "zod";
import { BaseEvaluationSchema, requiredStringFromNull, stringArray } from "../base-evaluation.schema";
import { FounderPitchRecommendationSchema } from "../simple-evaluation.schema";

const nullishToNull = (value: unknown): unknown =>
  value === undefined || value === null ? null : value;

const nullableUrl = z.preprocess(
  nullishToNull,
  z.string().url().nullable().default(null),
);

const nullableString = z.preprocess(
  nullishToNull,
  z.string().min(1).nullable().default(null),
);

const nullableThreatLevel = z.preprocess(
  nullishToNull,
  z.enum(["high", "medium", "low"]).nullable().default(null),
);

// --- Strategic Positioning ---

export const StrategicPositioningSchema = z.object({
  differentiation: requiredStringFromNull("Unknown"),
  uniqueValueProposition: requiredStringFromNull("Unknown"),
  differentiationType: z.enum([
    "technology",
    "network_effects",
    "data",
    "brand",
    "cost",
    "regulatory",
    "other",
  ]).default("other"),
  durability: z.enum(["strong", "moderate", "weak"]).default("weak"),
}).default({
  differentiation: "Unknown",
  uniqueValueProposition: "Unknown",
  differentiationType: "other",
  durability: "weak",
});

// --- Moat Assessment ---

export const MoatAssessmentSchema = z.object({
  moatType: z.enum([
    "network_effects",
    "switching_costs",
    "proprietary_data",
    "technology",
    "brand",
    "regulatory",
    "scale",
    "none",
  ]).default("none"),
  moatStage: z.enum(["potential", "emerging", "forming", "established", "dominant"]).default("potential"),
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
  currentGap: z.enum(["leading", "competitive", "behind", "unclear"]).default("unclear"),
  gapEvidence: requiredStringFromNull("Unknown"),
  vulnerabilities: stringArray,
  defensibleAgainstFunded: z.boolean().default(false),
  defensibilityRationale: requiredStringFromNull("Unknown"),
}).default({
  currentGap: "unclear",
  gapEvidence: "Unknown",
  vulnerabilities: [],
  defensibleAgainstFunded: false,
  defensibilityRationale: "Unknown",
});

// --- Competitors ---

const DirectCompetitorSchema = z.object({
  name: requiredStringFromNull("Unknown competitor"),
  description: requiredStringFromNull("Description unavailable"),
  url: nullableUrl,
  fundingRaised: nullableString,
});

const IndirectCompetitorSchema = z.object({
  name: requiredStringFromNull("Unknown competitor"),
  description: requiredStringFromNull("Description unavailable"),
  whyIndirect: nullableString,
  url: nullableUrl,
  threatLevel: nullableThreatLevel,
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
