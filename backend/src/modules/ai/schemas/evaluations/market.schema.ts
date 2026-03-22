import { z } from "zod";
import {
  BaseEvaluationSchema,
  BaseScoringSchema,
  EvaluationConfidenceSchema,
  requiredStringFromNull,
  stringArray,
} from "../base-evaluation.schema";
import { FounderPitchRecommendationSchema } from "../simple-evaluation.schema";

const booleanWithFallback = (fallback: boolean) =>
  z.preprocess(
    (value) => (typeof value === "boolean" ? value : fallback),
    z.boolean(),
  );

function enumWithFallback<const T extends readonly [string, ...string[]]>(
  values: T,
  fallback: T[number],
) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && (values as readonly string[]).includes(value)
        ? value
        : fallback,
    z.enum(values),
  );
}

const arrayWithFallback = <T extends z.ZodType<unknown>>(schema: T) =>
  z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(schema),
  );

const objectWithFallback = <T extends z.ZodType<unknown>>(schema: T) =>
  z.preprocess(
    (value) => (value ?? {}),
    schema,
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
  methodology: enumWithFallback(["top-down", "bottom-up", "blended"], "top-down"),
  sources: arrayWithFallback(MarketSourceSchema),
  confidence: z.preprocess(
    (value) => (value == null ? "low" : value),
    EvaluationConfidenceSchema,
  ),
});

const SamSchema = z.object({
  value: requiredStringFromNull("Unknown"),
  methodology: requiredStringFromNull("Unknown"),
  filters: stringArray,
  sources: arrayWithFallback(MarketSourceSchema),
  confidence: z.preprocess(
    (value) => (value == null ? "low" : value),
    EvaluationConfidenceSchema,
  ),
});

const SomSchema = z.object({
  value: requiredStringFromNull("Unknown"),
  methodology: requiredStringFromNull("Unknown"),
  assumptions: requiredStringFromNull("Unknown"),
  sources: arrayWithFallback(MarketSourceSchema),
  confidence: z.preprocess(
    (value) => (value == null ? "low" : value),
    EvaluationConfidenceSchema,
  ),
});

const BottomUpSanityCheckSchema = z.object({
  calculation: requiredStringFromNull("Not performed"),
  notes: requiredStringFromNull("No notes"),
});

const MetricAlignmentSchema = z.object({
  claimed: requiredStringFromNull("Unknown"),
  researched: requiredStringFromNull("Unknown"),
  alignmentScore: z.preprocess(
    (v) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.max(0, Math.min(100, Math.round(v)))
        : null,
    z.number().min(0).max(100).nullable(),
  ),
  notes: requiredStringFromNull("No notes"),
});

const DeckVsResearchSchema = z.preprocess(
  (value) => {
    const v = value as Record<string, unknown> | null | undefined;
    // Backward compat: convert legacy flat shape to per-metric
    if (v && "tamClaimed" in v && !("tam" in v)) {
      return {
        tam: {
          claimed: v.tamClaimed,
          researched: v.tamResearched,
          alignmentScore: null,
          notes:
            (v.notes as string) ??
            (v.discrepancyNotes as string) ??
            "No notes",
        },
        sam: {
          claimed: "Unknown",
          researched: "Unknown",
          alignmentScore: null,
          notes: "No notes",
        },
        som: {
          claimed: "Unknown",
          researched: "Unknown",
          alignmentScore: null,
          notes: "No notes",
        },
        overallNotes:
          (v.notes as string) ??
          (v.discrepancyNotes as string) ??
          "No notes",
      };
    }
    return v ?? {};
  },
  z.object({
    tam: objectWithFallback(MetricAlignmentSchema),
    sam: objectWithFallback(MetricAlignmentSchema),
    som: objectWithFallback(MetricAlignmentSchema),
    overallNotes: requiredStringFromNull("No notes"),
  }),
);

const MarketSizingRawSchema = z.object({
  tam: objectWithFallback(TamSchema),
  sam: objectWithFallback(SamSchema),
  som: objectWithFallback(SomSchema),
  bottomUpSanityCheck: objectWithFallback(BottomUpSanityCheckSchema),
  deckVsResearch: objectWithFallback(DeckVsResearchSchema),
});
const MarketSizingSchema = z.preprocess(
  (value) => value ?? {},
  MarketSizingRawSchema,
);

// --- Market Growth & Timing ---

const GrowthRateSchema = z.object({
  cagr: requiredStringFromNull("Unknown"),
  period: requiredStringFromNull("Unknown"),
  source: requiredStringFromNull("Unknown"),
  deckClaimed: requiredStringFromNull("Unknown"),
  discrepancyFlag: requiredStringFromNull("unknown"),
  trajectory: enumWithFallback(["accelerating", "stable", "decelerating"], "stable"),
});

const WhyNowSchema = z.object({
  thesis: requiredStringFromNull("Unknown"),
  supportedByResearch: booleanWithFallback(false),
  evidence: stringArray,
});

const MarketLifecycleSchema = z.object({
  position: enumWithFallback(
    ["emerging", "early_growth", "growth", "mature", "declining"],
    "emerging",
  ),
  evidence: requiredStringFromNull("Unknown"),
});

const MarketGrowthAndTimingRawSchema = z.object({
  growthRate: objectWithFallback(GrowthRateSchema),
  whyNow: objectWithFallback(WhyNowSchema),
  marketLifecycle: objectWithFallback(MarketLifecycleSchema),
});
const MarketGrowthAndTimingSchema = z.preprocess(
  (value) => value ?? {},
  MarketGrowthAndTimingRawSchema,
);

// --- Market Structure ---

const ImpactLevel = z.enum(["high", "medium", "low"]);
const EntrySeveritySchema = z.enum(["low", "moderate", "high"]);

const MarketForceSchema = z.object({
  factor: requiredStringFromNull("Unknown"),
  source: requiredStringFromNull("Unknown"),
  impact: z.preprocess((value) => (value == null ? "medium" : value), ImpactLevel),
});

const ConcentrationTrendSchema = z.object({
  direction: enumWithFallback(["consolidating", "stable", "fragmenting"], "stable"),
  evidence: requiredStringFromNull("Unknown"),
});

const EntryConditionSchema = z.object({
  factor: requiredStringFromNull("Unknown factor"),
  severity: z.preprocess((value) => (value == null ? "moderate" : value), EntrySeveritySchema),
  note: requiredStringFromNull("Unknown"),
});

const MarketStructureRawSchema = z.object({
  structureType: enumWithFallback(
    ["fragmented", "consolidating", "emerging", "concentrated"],
    "emerging",
  ),
  concentrationTrend: objectWithFallback(ConcentrationTrendSchema),
  entryConditions: arrayWithFallback(EntryConditionSchema),
  tailwinds: arrayWithFallback(MarketForceSchema),
  headwinds: arrayWithFallback(MarketForceSchema),
});
const MarketStructureSchema = z.preprocess(
  (value) => value ?? {},
  MarketStructureRawSchema,
);

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
