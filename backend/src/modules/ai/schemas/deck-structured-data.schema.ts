import { z } from "zod";

const nullableString = z.string().nullable().default(null);
const nullableNumber = z.number().nullable().default(null);

const DeckFinancialsSchema = z.preprocess(
  (val) => val ?? {},
  z.object({
    arr: nullableString,
    mrr: nullableString,
    revenue: nullableString,
    growthRate: nullableString,
    grossMargin: nullableString,
    burnRate: nullableString,
    runway: nullableString,
    ltv: nullableString,
    cac: nullableString,
    nrr: nullableString,
  }),
);

const DeckTractionSchema = z.preprocess(
  (val) => val ?? {},
  z.object({
    customers: nullableString,
    users: nullableString,
    churnRate: nullableString,
    notableClaims: z.array(z.string()).default([]),
  }),
);

const DeckMarketSchema = z.preprocess(
  (val) => val ?? {},
  z.object({
    tam: nullableString,
    sam: nullableString,
    som: nullableString,
    marketGrowthRate: nullableString,
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
  }),
);

const DeckProductSchema = z.preprocess(
  (val) => val ?? {},
  z.object({
    stage: nullableString,
    description: nullableString,
    keyFeatures: z.array(z.string()).default([]),
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
});

/** Full schema including metadata — used for persistence & downstream. */
export const DeckStructuredDataSchema = DeckStructuredDataAiSchema.extend({
  extractedAt: z.string(),
});

export type DeckStructuredData = z.infer<typeof DeckStructuredDataSchema>;
