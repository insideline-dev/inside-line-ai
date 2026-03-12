import { z } from "zod";
import {
  BaseEvaluationSchema,
  BaseScoringSchema,
  EvaluationConfidenceSchema,
  requiredStringFromNull,
  stringArray,
} from "../base-evaluation.schema";
import { FounderPitchRecommendationSchema } from "../simple-evaluation.schema";

const nullToUndefined = (value: unknown): unknown =>
  value === null ? undefined : value;

const optionalUrl = z.preprocess(
  nullToUndefined,
  z.string().url().optional(),
);

// --- Market Sizing ---

const MarketSourceSchema = z.object({
  name: requiredStringFromNull("Unknown source"),
  tier: requiredStringFromNull("Tier 3"),
  date: requiredStringFromNull("Unknown date"),
  geography: requiredStringFromNull("Unknown geography"),
});

const TamSchema = z.object({
  value: requiredStringFromNull("Unknown"),
  methodology: z.enum(["top-down", "bottom-up", "blended"]).default("top-down"),
  sources: z.array(MarketSourceSchema).default([]),
  confidence: EvaluationConfidenceSchema.default("low"),
}).default({ value: "Unknown", methodology: "top-down", sources: [], confidence: "low" });

const SamSchema = z.object({
  value: requiredStringFromNull("Unknown"),
  methodology: requiredStringFromNull("Unknown"),
  filters: stringArray,
  sources: z.array(MarketSourceSchema).default([]),
  confidence: EvaluationConfidenceSchema.default("low"),
}).default({ value: "Unknown", methodology: "Unknown", filters: [], sources: [], confidence: "low" });

const SomSchema = z.object({
  value: requiredStringFromNull("Unknown"),
  methodology: requiredStringFromNull("Unknown"),
  assumptions: requiredStringFromNull("Unknown"),
  confidence: EvaluationConfidenceSchema.default("low"),
}).default({ value: "Unknown", methodology: "Unknown", assumptions: "Unknown", confidence: "low" });

const BottomUpSanityCheckSchema = z.object({
  calculation: requiredStringFromNull("Not performed"),
  plausible: requiredStringFromNull("unknown"),
  notes: requiredStringFromNull("No notes"),
}).default({ calculation: "Not performed", plausible: "unknown", notes: "No notes" });

const DeckVsResearchSchema = z.object({
  tamClaimed: requiredStringFromNull("Unknown"),
  tamResearched: requiredStringFromNull("Unknown"),
  discrepancyFlag: requiredStringFromNull("unknown"),
  notes: requiredStringFromNull("No discrepancy noted"),
}).default({ tamClaimed: "Unknown", tamResearched: "Unknown", discrepancyFlag: "unknown", notes: "No discrepancy noted" });

const MarketSizingRawSchema = z.object({
  tam: TamSchema,
  sam: SamSchema,
  som: SomSchema,
  bottomUpSanityCheck: BottomUpSanityCheckSchema,
  deckVsResearch: DeckVsResearchSchema,
});
const MarketSizingSchema = z.preprocess(
  (value) => value ?? {},
  MarketSizingRawSchema,
).default({} as z.output<typeof MarketSizingRawSchema>);

// --- Market Growth & Timing ---

const GrowthRateSchema = z.object({
  cagr: requiredStringFromNull("Unknown"),
  period: requiredStringFromNull("Unknown"),
  source: requiredStringFromNull("Unknown"),
  deckClaimed: requiredStringFromNull("Unknown"),
  discrepancyFlag: requiredStringFromNull("unknown"),
  trajectory: z.enum(["accelerating", "stable", "decelerating"]).default("stable"),
}).default({
  cagr: "Unknown",
  period: "Unknown",
  source: "Unknown",
  deckClaimed: "Unknown",
  discrepancyFlag: "unknown",
  trajectory: "stable",
});

const WhyNowSchema = z.object({
  thesis: requiredStringFromNull("Unknown"),
  supportedByResearch: z.boolean().default(false),
  evidence: stringArray,
}).default({ thesis: "Unknown", supportedByResearch: false, evidence: [] });

const MarketLifecycleSchema = z.object({
  position: z.enum(["emerging", "early_growth", "growth", "mature", "declining"]).default("emerging"),
  evidence: requiredStringFromNull("Unknown"),
}).default({ position: "emerging", evidence: "Unknown" });

const MarketGrowthAndTimingRawSchema = z.object({
  growthRate: GrowthRateSchema,
  whyNow: WhyNowSchema,
  timingAssessment: z.enum(["too_early", "slightly_early", "right_time", "slightly_late", "too_late"]).default("right_time"),
  marketLifecycle: MarketLifecycleSchema,
});
const MarketGrowthAndTimingSchema = z.preprocess(
  (value) => value ?? {},
  MarketGrowthAndTimingRawSchema,
).default({} as z.output<typeof MarketGrowthAndTimingRawSchema>);

// --- Market Structure ---

const ImpactLevel = z.enum(["high", "medium", "low"]);
const EntrySeveritySchema = z.enum(["low", "moderate", "high"]);

const MarketForceSchema = z.object({
  factor: requiredStringFromNull("Unknown"),
  source: requiredStringFromNull("Unknown"),
  impact: ImpactLevel.default("medium"),
});

const ConcentrationTrendSchema = z.object({
  direction: z.enum(["consolidating", "stable", "fragmenting"]).default("stable"),
  evidence: requiredStringFromNull("Unknown"),
}).default({ direction: "stable", evidence: "Unknown" });

const EntryConditionSchema = z.object({
  factor: requiredStringFromNull("Unknown factor"),
  severity: EntrySeveritySchema.default("moderate"),
  note: requiredStringFromNull("Unknown"),
});

const MarketStructureRawSchema = z.object({
  structureType: z.enum(["fragmented", "consolidating", "emerging", "concentrated"]).default("emerging"),
  concentrationTrend: ConcentrationTrendSchema,
  entryConditions: z.array(EntryConditionSchema).default([]),
  tailwinds: z.array(MarketForceSchema).default([]),
  headwinds: z.array(MarketForceSchema).default([]),
});
const MarketStructureSchema = z.preprocess(
  (value) => value ?? {},
  MarketStructureRawSchema,
).default({} as z.output<typeof MarketStructureRawSchema>);

// --- Main Schema ---

export const MarketEvaluationSchema = BaseEvaluationSchema.extend({
  marketSizing: MarketSizingSchema,
  marketGrowthAndTiming: MarketGrowthAndTimingSchema,
  marketStructure: MarketStructureSchema,
  scoring: z.preprocess(
    (value) =>
      value ?? {
        overallScore: 50,
        confidence: "low",
        scoringBasis: "Score calibrated from market sizing, timing, and structure evidence.",
        subScores: [],
      },
    BaseScoringSchema,
  ),
  diligenceItems: stringArray,
  founderPitchRecommendations: z.array(FounderPitchRecommendationSchema).default([]),
});

export type MarketEvaluation = z.infer<typeof MarketEvaluationSchema>;
