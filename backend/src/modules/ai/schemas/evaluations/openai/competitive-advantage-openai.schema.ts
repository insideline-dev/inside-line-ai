// OpenAI strict mode: no preprocess, no default. Mirrors CompetitiveAdvantageEvaluationSchema shape.
import { z } from "zod";
import {
  BaseEvaluationOpenAiSchema,
  FounderPitchRecommendationOpenAiSchema,
} from "../../base-evaluation-openai.schema";

// --- Strategic Positioning ---

const StrategicPositioningOpenAiSchema = z.object({
  differentiation: z.string(),
  uniqueValueProposition: z.string(),
  differentiationType: z.enum([
    "technology",
    "network_effects",
    "data",
    "brand",
    "cost",
    "regulatory",
    "other",
  ]),
  durability: z.enum(["strong", "moderate", "weak"]),
});

// --- Moat Assessment ---

const MoatAssessmentOpenAiSchema = z.object({
  moatType: z.enum([
    "network_effects",
    "switching_costs",
    "proprietary_data",
    "technology",
    "brand",
    "regulatory",
    "scale",
    "none",
  ]),
  moatStage: z.enum([
    "potential",
    "emerging",
    "forming",
    "established",
    "dominant",
  ]),
  moatEvidence: z.array(z.string()),
  selfReinforcing: z.boolean(),
  timeToReplicate: z.string(),
});

// --- Barriers to Entry ---

const BarriersToEntryOpenAiSchema = z.object({
  technical: z.boolean(),
  capital: z.boolean(),
  network: z.boolean(),
  regulatory: z.boolean(),
});

// --- Competitive Position ---

const CompetitivePositionOpenAiSchema = z.object({
  currentGap: z.enum(["leading", "competitive", "behind", "unclear"]),
  gapEvidence: z.string(),
  vulnerabilities: z.array(z.string()),
  defensibleAgainstFunded: z.boolean(),
  defensibilityRationale: z.string(),
});

// --- Competitors ---

const DirectCompetitorOpenAiSchema = z.object({
  name: z.string(),
  description: z.string(),
  url: z.string().nullable(),
  fundingRaised: z.string().nullable(),
});

const IndirectCompetitorOpenAiSchema = z.object({
  name: z.string(),
  description: z.string(),
  whyIndirect: z.string().nullable(),
  url: z.string().nullable(),
  threatLevel: z.enum(["high", "medium", "low"]).nullable(),
});

const CompetitorsOpenAiSchema = z.object({
  direct: z.array(DirectCompetitorOpenAiSchema),
  indirect: z.array(IndirectCompetitorOpenAiSchema),
  advantages: z.array(z.string()),
  risks: z.array(z.string()),
  details: z.array(z.string()),
});

// --- Main Schema ---

export const CompetitiveAdvantageEvaluationOpenAiSchema =
  BaseEvaluationOpenAiSchema.extend({
    strategicPositioning: StrategicPositioningOpenAiSchema,
    moatAssessment: MoatAssessmentOpenAiSchema,
    barriersToEntry: BarriersToEntryOpenAiSchema,
    competitivePosition: CompetitivePositionOpenAiSchema,
    competitors: CompetitorsOpenAiSchema,
    strengths: z.array(z.string()),
    founderPitchRecommendations: z.array(
      FounderPitchRecommendationOpenAiSchema,
    ),
  });
