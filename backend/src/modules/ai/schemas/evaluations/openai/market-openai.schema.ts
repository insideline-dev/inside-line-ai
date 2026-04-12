// OpenAI strict mode: no preprocess, no default. Mirrors MarketEvaluationSchema shape.
import { z } from "zod";
import {
  BaseEvaluationOpenAiSchema,
  BaseScoringOpenAiSchema,
  EvaluationConfidenceOpenAiSchema,
  FounderPitchRecommendationOpenAiSchema,
} from "../../base-evaluation-openai.schema";

// --- Market Sizing ---

const MarketSourceOpenAiSchema = z.object({
  name: z.string(),
  tier: z.string(),
  date: z.string(),
  geography: z.string(),
});

const TamOpenAiSchema = z.object({
  value: z.string(),
  methodology: z.enum(["top-down", "bottom-up", "blended"]),
  sources: z.array(MarketSourceOpenAiSchema),
  confidence: EvaluationConfidenceOpenAiSchema,
});

const SamOpenAiSchema = z.object({
  value: z.string(),
  methodology: z.string(),
  filters: z.array(z.string()),
  sources: z.array(MarketSourceOpenAiSchema),
  confidence: EvaluationConfidenceOpenAiSchema,
});

const SomOpenAiSchema = z.object({
  value: z.string(),
  methodology: z.string(),
  assumptions: z.string(),
  sources: z.array(MarketSourceOpenAiSchema),
  confidence: EvaluationConfidenceOpenAiSchema,
});

const BottomUpSanityCheckOpenAiSchema = z.object({
  calculation: z.string(),
  notes: z.string(),
});

const MetricAlignmentOpenAiSchema = z.object({
  claimed: z.string(),
  researched: z.string(),
  alignmentScore: z.number().min(0).max(100).nullable(),
  notes: z.string(),
});

const DeckVsResearchOpenAiSchema = z.object({
  tam: MetricAlignmentOpenAiSchema,
  sam: MetricAlignmentOpenAiSchema,
  som: MetricAlignmentOpenAiSchema,
  overallNotes: z.string(),
});

const MarketSizingOpenAiSchema = z.object({
  tam: TamOpenAiSchema,
  sam: SamOpenAiSchema,
  som: SomOpenAiSchema,
  bottomUpSanityCheck: BottomUpSanityCheckOpenAiSchema,
  deckVsResearch: DeckVsResearchOpenAiSchema,
});

// --- Market Growth & Timing ---

const GrowthRateOpenAiSchema = z.object({
  cagr: z.string(),
  period: z.string(),
  source: z.string(),
  deckClaimed: z.string(),
  deckClaimedPeriod: z.string(),
  deckClaimedAnnualized: z.string(),
  discrepancyFlag: z.string(),
  trajectory: z.enum(["accelerating", "stable", "decelerating"]),
  year: z.string(),
  sourceUrl: z.string(),
  dataType: z.enum(["forecast", "actual", "unknown"]),
});

const StandardizedGrowthRateOpenAiSchema = z
  .object({
    cagr: z.number().nullable(),
    originalRate: z.number().nullable(),
    originalBasis: z.string(),
    period: z.string(),
  })
  .nullable();

const WhyNowOpenAiSchema = z.object({
  thesis: z.string(),
  supportedByResearch: z.boolean(),
  evidence: z.array(z.string()),
});

const MarketLifecycleOpenAiSchema = z.object({
  position: z.enum([
    "emerging",
    "early_growth",
    "growth",
    "mature",
    "declining",
  ]),
  evidence: z.string(),
});

const MarketGrowthAndTimingOpenAiSchema = z.object({
  growthRate: GrowthRateOpenAiSchema,
  standardizedGrowthRate: StandardizedGrowthRateOpenAiSchema,
  whyNow: WhyNowOpenAiSchema,
  marketLifecycle: MarketLifecycleOpenAiSchema,
});

// --- Market Structure ---

const ImpactLevelOpenAi = z.enum(["high", "medium", "low"]);

const MarketForceOpenAiSchema = z.object({
  factor: z.string(),
  source: z.string(),
  impact: ImpactLevelOpenAi,
});

const ConcentrationTrendOpenAiSchema = z.object({
  direction: z.enum(["consolidating", "stable", "fragmenting"]),
  evidence: z.string(),
});

const EntryConditionOpenAiSchema = z.object({
  factor: z.string(),
  severity: z.enum(["low", "moderate", "high"]),
  note: z.string(),
});

const MarketStructureOpenAiSchema = z.object({
  structureType: z.enum([
    "fragmented",
    "consolidating",
    "emerging",
    "concentrated",
  ]),
  concentrationTrend: ConcentrationTrendOpenAiSchema,
  entryConditions: z.array(EntryConditionOpenAiSchema),
  tailwinds: z.array(MarketForceOpenAiSchema),
  headwinds: z.array(MarketForceOpenAiSchema),
});

// --- Main Schema ---

export const MarketEvaluationOpenAiSchema = BaseEvaluationOpenAiSchema.extend({
  marketSizing: MarketSizingOpenAiSchema,
  marketGrowthAndTiming: MarketGrowthAndTimingOpenAiSchema,
  marketStructure: MarketStructureOpenAiSchema,
  scoring: BaseScoringOpenAiSchema,
  diligenceItems: z.array(z.string()),
  founderPitchRecommendations: z.array(FounderPitchRecommendationOpenAiSchema),
});
