import { z } from "zod";

const nullableString = z.string().nullable().default(null);
const nullableNumber = z.number().nullable().default(null);

// DS-E12-F1: per-section deck-page provenance. Each section carries the
// 1-based page numbers from the source deck where it was extracted, so DD
// and lens evidence can deep-link back to the page without re-reading the
// file. Empty array means "the LLM saw nothing for this section".
const sourcePages = z.array(z.number().int().min(1)).default([]);

const requiredSourcePages = z.array(z.number().int().min(1)).min(1);

const DeckArrKpiSchema = z.preprocess(
  (v) => v ?? null,
  z
    .object({
      value: z.string(),
      currency: z.string().default("USD"),
      period: z.string().default("current"),
      sourcePages: requiredSourcePages,
    })
    .nullable(),
);

const DeckGrowthRateKpiSchema = z.preprocess(
  (v) => v ?? null,
  z
    .object({
      value: z.string(),
      basis: z
        .enum(["MoM", "QoQ", "YoY", "CAGR", "unknown"])
        .default("unknown"),
      period: z.string().default("current"),
      sourcePages: requiredSourcePages,
    })
    .nullable(),
);

const DeckGrossMarginKpiSchema = z.preprocess(
  (v) => v ?? null,
  z
    .object({
      value: z.string(),
      period: z.string().default("current"),
      sourcePages: requiredSourcePages,
    })
    .nullable(),
);

const DeckFinancialsSchema = z.preprocess(
  (val) => val ?? {},
  z.object({
    arr: nullableString,
    mrr: nullableString,
    revenue: nullableString,
    growthRate: nullableString,
    growthRatePeriod: nullableString,
    grossMargin: nullableString,
    burnRate: nullableString,
    runway: nullableString,
    ltv: nullableString,
    cac: nullableString,
    nrr: nullableString,
    arrKpi: DeckArrKpiSchema.default(null),
    growthRateKpi: DeckGrowthRateKpiSchema.default(null),
    grossMarginKpi: DeckGrossMarginKpiSchema.default(null),
    sourcePages,
  }),
);

const DeckTractionSchema = z.preprocess(
  (val) => val ?? {},
  z.object({
    customers: nullableString,
    users: nullableString,
    churnRate: nullableString,
    notableClaims: z.array(z.string()).default([]),
    sourcePages,
  }),
);

const DeckTamKpiSchema = z.preprocess(
  (v) => v ?? null,
  z
    .object({
      value: z.string(),
      scale: z.enum(["M", "B", "T"]).default("B"),
      currency: z.string().default("USD"),
      sourcePages: requiredSourcePages,
    })
    .nullable(),
);

const DeckMarketSchema = z.preprocess(
  (val) => val ?? {},
  z.object({
    tam: nullableString,
    sam: nullableString,
    som: nullableString,
    marketGrowthRate: nullableString,
    tamKpi: DeckTamKpiSchema.default(null),
    sourcePages,
  }),
);

const DeckFundraisingSchema = z.preprocess(
  (val) => val ?? {},
  z.object({
    askAmount: nullableString,
    valuation: nullableString,
    roundType: nullableString,
    useOfFunds: z.array(z.string()).default([]),
    previousFunding: nullableString,
    sourcePages,
  }),
);

const DeckProductSchema = z.preprocess(
  (val) => val ?? {},
  z.object({
    stage: nullableString,
    description: nullableString,
    keyFeatures: z.array(z.string()).default([]),
    sourcePages,
  }),
);

const DeckTeamMemberSchema = z.object({
  name: z.string(),
  role: z.string().nullable().default(null),
});

const DeckTeamSchema = z.preprocess(
  (val) => val ?? {},
  z.object({
    founderCount: nullableNumber,
    teamSize: nullableString,
    keyMembers: z.array(DeckTeamMemberSchema).default([]),
    sourcePages,
  }),
);

// DS-E12-F1 — narrative sections required by the screening lenses + memo
// scaffold. Each section is a short statement plus 1-N supporting bullets,
// plus the page numbers it came from. Empty defaults stay safe for old rows.
const DeckProblemSchema = z.preprocess(
  (val) => val ?? {},
  z.object({
    statement: nullableString,
    painPoints: z.array(z.string()).default([]),
    sourcePages,
  }),
);

const DeckSolutionSchema = z.preprocess(
  (val) => val ?? {},
  z.object({
    statement: nullableString,
    keyDifferentiators: z.array(z.string()).default([]),
    sourcePages,
  }),
);

const DeckCompetitorSchema = z.object({
  name: z.string(),
  positioning: z.string().nullable().default(null),
});

const DeckCompetitorsSchema = z.preprocess(
  (val) => val ?? {},
  z.object({
    namedCompetitors: z.array(DeckCompetitorSchema).default([]),
    moat: nullableString,
    sourcePages,
  }),
);

/** Schema used by AI extraction (no metadata fields). */
export const DeckStructuredDataAiSchema = z.object({
  financials: DeckFinancialsSchema,
  traction: DeckTractionSchema,
  market: DeckMarketSchema,
  fundraising: DeckFundraisingSchema,
  product: DeckProductSchema,
  team: DeckTeamSchema,
  // DS-E12-F1 — section-keyed narrative fields with page-level provenance.
  // These feed both screening lens prompts and the DD memo scaffold so the
  // extraction step runs once per deal.
  problem: DeckProblemSchema,
  solution: DeckSolutionSchema,
  competitors: DeckCompetitorsSchema,
});

/** Full schema including metadata — used for persistence & downstream. */
export const DeckStructuredDataSchema = DeckStructuredDataAiSchema.extend({
  extractedAt: z.string(),
});

export type DeckStructuredData = z.infer<typeof DeckStructuredDataSchema>;
