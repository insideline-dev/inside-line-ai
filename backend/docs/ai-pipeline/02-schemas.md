# Phase 2: Zod Schemas

**Status:** Ready for Implementation
**Dependencies:** None (fully parallel with Phase 01)
**Estimated Effort:** S (1-2 days)
**Parallelizable With:** Phase 01 (Foundation)

---

## Goal

Define all Zod schemas for AI agent outputs. These schemas enforce contracts for `generateObject()` calls and map directly to `startup_evaluations` database columns.

**Deliverables:**
- Base evaluation schema with shared fields
- 11 evaluation agent schemas (one per evaluation agent)
- 4 research agent schemas
- Extraction schema (PDF field extraction)
- Synthesis schema (final output)
- Thesis alignment schema

**Total Schemas:** ~20 Zod schema files

---

## Prerequisites

### Packages Required
- `zod` (already installed in project)

### Reference Files
- `old-backend/types/*.ts` (for field names and structures)
- Database schema: `startup_evaluations` table definition
- Existing types in `src/modules/startup/entities/startup.entity.ts`

---

## Deliverables

### New Files to Create

| File Path | Purpose | Exports |
|-----------|---------|---------|
| `src/modules/ai/schemas/base-evaluation.schema.ts` | Shared base schema for all evaluations | `BaseEvaluationSchema`, `BaseEvaluation` type |
| `src/modules/ai/schemas/extraction.schema.ts` | PDF field extraction output | `ExtractionSchema`, `Extraction` type |
| `src/modules/ai/schemas/synthesis.schema.ts` | Final synthesis output | `SynthesisSchema`, `Synthesis` type |
| **Evaluation Schemas (11 files):** | | |
| `src/modules/ai/schemas/evaluations/team.schema.ts` | Team evaluation | `TeamEvaluationSchema`, `TeamEvaluation` |
| `src/modules/ai/schemas/evaluations/market.schema.ts` | Market evaluation | `MarketEvaluationSchema`, `MarketEvaluation` |
| `src/modules/ai/schemas/evaluations/product.schema.ts` | Product evaluation | `ProductEvaluationSchema`, `ProductEvaluation` |
| `src/modules/ai/schemas/evaluations/traction.schema.ts` | Traction evaluation | `TractionEvaluationSchema`, `TractionEvaluation` |
| `src/modules/ai/schemas/evaluations/business-model.schema.ts` | Business model evaluation | `BusinessModelEvaluationSchema` |
| `src/modules/ai/schemas/evaluations/gtm.schema.ts` | Go-to-market evaluation | `GtmEvaluationSchema`, `GtmEvaluation` |
| `src/modules/ai/schemas/evaluations/financials.schema.ts` | Financial evaluation | `FinancialsEvaluationSchema`, `FinancialsEvaluation` |
| `src/modules/ai/schemas/evaluations/competitive-advantage.schema.ts` | Competitive advantage eval | `CompetitiveAdvantageEvaluationSchema` |
| `src/modules/ai/schemas/evaluations/legal.schema.ts` | Legal/IP evaluation | `LegalEvaluationSchema`, `LegalEvaluation` |
| `src/modules/ai/schemas/evaluations/deal-terms.schema.ts` | Deal terms evaluation | `DealTermsEvaluationSchema`, `DealTermsEvaluation` |
| `src/modules/ai/schemas/evaluations/exit-potential.schema.ts` | Exit potential evaluation | `ExitPotentialEvaluationSchema` |
| **Research Schemas (4 files):** | | |
| `src/modules/ai/schemas/research/team-research.schema.ts` | Team research output | `TeamResearchSchema`, `TeamResearch` |
| `src/modules/ai/schemas/research/market-research.schema.ts` | Market research output | `MarketResearchSchema`, `MarketResearch` |
| `src/modules/ai/schemas/research/product-research.schema.ts` | Product research output | `ProductResearchSchema`, `ProductResearch` |
| `src/modules/ai/schemas/research/news-research.schema.ts` | News/PR research output | `NewsResearchSchema`, `NewsResearch` |
| **Matching Schemas:** | | |
| `src/modules/ai/schemas/matching/thesis-alignment.schema.ts` | Thesis fit scoring | `ThesisAlignmentSchema`, `ThesisAlignment` |

---

## Schema Design Patterns

### Base Evaluation Schema

**File:** `src/modules/ai/schemas/base-evaluation.schema.ts`

**Shared Fields (inherited by all 11 evaluation schemas):**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `score` | number | 0-100, integer | Overall score for this evaluation dimension |
| `confidence` | number | 0-1, decimal | Agent's confidence in the evaluation |
| `keyFindings` | string[] | min 1 item | Top positive findings |
| `risks` | string[] | min 0 items | Identified risks and concerns |
| `dataGaps` | string[] | min 0 items | Missing information that affected evaluation |
| `sources` | string[] | min 0 items | URLs or references used |

**Example Structure:**
```typescript
import { z } from 'zod';

export const BaseEvaluationSchema = z.object({
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  keyFindings: z.array(z.string()).min(1),
  risks: z.array(z.string()).default([]),
  dataGaps: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
});

export type BaseEvaluation = z.infer<typeof BaseEvaluationSchema>;
```

**Validation Rules:**
- `score` must be integer (no decimals)
- `confidence` allows decimals (e.g., 0.85)
- `keyFindings` required, minimum 1 item
- Other arrays optional but default to empty array

---

## Schema Compatibility with Old Backend

**Output Shape Compatibility:** Zod schemas designed to match existing DB column structures for frontend compatibility.

**9/11 Evaluation Agents:**
- Output shapes fully compatible with existing `startup_evaluations` DB columns
- JSONB columns (`teamData`, `marketData`, etc.) accept new schema outputs without migration

**Team Agent Enhancements:**
- Minor additions possible (e.g., `cofounderDynamics`, `hasOperationsLeader`)
- JSONB accepts any valid JSON - backward compatible

**Synthesis:**
- Perfect match with existing DB columns
- No schema drift concerns

**Research Agents:**
- Zod schemas mirror old backend types from `research-orchestrator.ts`
- Outputs: `TeamMemberResearch`, `MarketResearch`, `ProductResearch`, `NewsResearch`
- JSONB columns flexible - can add new fields without breaking frontend

**Compatibility Rule:** Match old output shapes for frontend compatibility, add new fields as needed without breaking changes.

---

## Database Column Mapping

### Evaluation Agents → DB Columns

| Agent Schema | Data Column (JSONB) | Score Column | Additional Columns |
|-------------|---------------------|--------------|-------------------|
| `team.schema.ts` | `teamData` | `teamScore` | `teamMemberEvaluations`, `founderMarketFit`, `executionRiskNotes`, `teamComposition` |
| `market.schema.ts` | `marketData` | `marketScore` | `tamValidation`, `marketCredibility` |
| `product.schema.ts` | `productData` | `productScore` | `productSummary`, `extractedFeatures`, `extractedTechStack` |
| `traction.schema.ts` | `tractionData` | `tractionScore` | (none) |
| `business-model.schema.ts` | `businessModelData` | `businessModelScore` | (none) |
| `gtm.schema.ts` | `gtmData` | `gtmScore` | (none) |
| `financials.schema.ts` | `financialsData` | `financialsScore` | (none) |
| `competitive-advantage.schema.ts` | `competitiveAdvantageData` | `competitiveAdvantageScore` | (none) |
| `legal.schema.ts` | `legalData` | `legalScore` | (none) |
| `deal-terms.schema.ts` | `dealTermsData` | `dealTermsScore` | (none) |
| `exit-potential.schema.ts` | `exitPotentialData` | `exitPotentialScore` | (none) |

**Mapping Strategy:**
- `{agent}Data` column stores full schema output as JSONB
- `{agent}Score` column stores top-level `score` field
- Additional columns store specific extracted fields

---

## Evaluation Schema Specifications

### 1. Team Evaluation Schema

**File:** `src/modules/ai/schemas/evaluations/team.schema.ts`

**Extends:** `BaseEvaluationSchema`

**Additional Fields:**

| Field | Type | Description | Maps to DB Column |
|-------|------|-------------|-------------------|
| `founderQuality` | string | Assessment of founder backgrounds | `teamData.founderQuality` |
| `teamCompletion` | number (0-100) | How complete the team is | `teamComposition` |
| `executionCapability` | string | Ability to execute on vision | `executionRiskNotes` |
| `founderMarketFitScore` | number (0-100) | Founder-market fit rating | `founderMarketFit` |
| `teamMembers` | array of objects | Individual member assessments | `teamMemberEvaluations` |

**Team Member Object Schema:**
```typescript
{
  name: string;
  role: string;
  background: string;
  strengths: string[];
  concerns: string[];
}
```

---

### 2. Market Evaluation Schema

**File:** `src/modules/ai/schemas/evaluations/market.schema.ts`

**Additional Fields:**

| Field | Type | Description | Maps to DB Column |
|-------|------|-------------|-------------------|
| `marketSize` | string | TAM/SAM/SOM assessment | `marketData.marketSize` |
| `marketGrowth` | string | Growth rate and trends | `marketData.marketGrowth` |
| `tamEstimate` | number | Total addressable market ($) | `tamValidation` |
| `marketTiming` | string | Why now analysis | `marketData.marketTiming` |
| `credibilityScore` | number (0-100) | Market claim credibility | `marketCredibility` |

---

### 3. Product Evaluation Schema

**File:** `src/modules/ai/schemas/evaluations/product.schema.ts`

**Additional Fields:**

| Field | Type | Description | Maps to DB Column |
|-------|------|-------------|-------------------|
| `productDescription` | string | What the product does | `productSummary` |
| `uniqueValue` | string | Unique value proposition | `productData.uniqueValue` |
| `technologyStack` | string[] | Tech stack used | `extractedTechStack` |
| `keyFeatures` | string[] | Core features list | `extractedFeatures` |
| `productMaturity` | string | Development stage | `productData.productMaturity` |

---

### 4. Traction Evaluation Schema

**File:** `src/modules/ai/schemas/evaluations/traction.schema.ts`

**Additional Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `metrics` | object | Key traction metrics (users, revenue, growth) |
| `customerValidation` | string | Customer adoption evidence |
| `growthTrajectory` | string | Growth rate analysis |
| `revenueModel` | string | How they make money |

---

### 5. Business Model Evaluation Schema

**File:** `src/modules/ai/schemas/evaluations/business-model.schema.ts`

**Additional Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `revenueStreams` | string[] | How they monetize |
| `unitEconomics` | string | CAC, LTV, margins |
| `scalability` | string | How model scales |
| `defensibility` | string | Business model moats |

---

### 6. GTM Evaluation Schema

**File:** `src/modules/ai/schemas/evaluations/gtm.schema.ts`

**Additional Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `customerSegments` | string[] | Target customer types |
| `acquisitionChannels` | string[] | How they acquire customers |
| `salesStrategy` | string | Sales approach (self-serve, enterprise, etc.) |
| `pricingStrategy` | string | Pricing model |

---

### 7. Financials Evaluation Schema

**File:** `src/modules/ai/schemas/evaluations/financials.schema.ts`

**Additional Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `burnRate` | number | Monthly burn ($) |
| `runway` | number | Months of runway |
| `fundingHistory` | object[] | Previous rounds |
| `financialHealth` | string | Overall financial assessment |

---

### 8. Competitive Advantage Schema

**File:** `src/modules/ai/schemas/evaluations/competitive-advantage.schema.ts`

**Additional Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `moats` | string[] | Defensible moats |
| `competitivePosition` | string | Position vs competitors |
| `barriers` | string[] | Entry barriers they've created |

---

### 9. Legal Evaluation Schema

**File:** `src/modules/ai/schemas/evaluations/legal.schema.ts`

**Additional Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `ipStatus` | string | Patent/IP portfolio |
| `regulatoryRisks` | string[] | Compliance concerns |
| `legalStructure` | string | Corporate structure |

---

### 10. Deal Terms Evaluation Schema

**File:** `src/modules/ai/schemas/evaluations/deal-terms.schema.ts`

**Additional Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `valuation` | number | Pre-money valuation |
| `askAmount` | number | Amount raising |
| `equity` | number | Equity offered (%) |
| `termsQuality` | string | Assessment of terms |

---

### 11. Exit Potential Schema

**File:** `src/modules/ai/schemas/evaluations/exit-potential.schema.ts`

**Additional Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `exitScenarios` | string[] | Potential exit paths |
| `acquirers` | string[] | Potential acquirers |
| `exitTimeline` | string | Expected time to exit |
| `returnPotential` | string | Projected return multiple |

---

## Research Schema Specifications

### 1. Team Research Schema

**File:** `src/modules/ai/schemas/research/team-research.schema.ts`

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `linkedinProfiles` | array of objects | Founder LinkedIn data |
| `previousCompanies` | string[] | Past companies worked at |
| `education` | string[] | Educational background |
| `achievements` | string[] | Notable accomplishments |
| `onlinePresence` | object | Social media, GitHub, etc. |
| `sources` | string[] | URLs referenced |

**LinkedIn Profile Object:**
```typescript
{
  name: string;
  title: string;
  company: string;
  experience: string[];
  url: string;
}
```

---

### 2. Market Research Schema

**File:** `src/modules/ai/schemas/research/market-research.schema.ts`

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `marketReports` | string[] | Industry reports found |
| `competitors` | array of objects | Competitor info |
| `marketTrends` | string[] | Current trends |
| `marketSize` | object | TAM/SAM/SOM data |
| `sources` | string[] | URLs referenced |

**Competitor Object:**
```typescript
{
  name: string;
  description: string;
  fundingRaised?: number;
  url: string;
}
```

---

### 3. Product Research Schema

**File:** `src/modules/ai/schemas/research/product-research.schema.ts`

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `productPages` | string[] | Product page URLs |
| `features` | string[] | Extracted features |
| `techStack` | string[] | Technologies used |
| `integrations` | string[] | Integration partners |
| `customerReviews` | object | Review sentiment |
| `sources` | string[] | URLs referenced |

---

### 4. News Research Schema

**File:** `src/modules/ai/schemas/research/news-research.schema.ts`

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `articles` | array of objects | News articles found |
| `pressReleases` | string[] | PR announcements |
| `sentiment` | string | Overall sentiment (positive/neutral/negative) |
| `recentEvents` | string[] | Recent milestones |
| `sources` | string[] | URLs referenced |

**Article Object:**
```typescript
{
  title: string;
  source: string;
  date: string;
  summary: string;
  url: string;
}
```

---

## Extraction & Synthesis Schemas

### Extraction Schema

**File:** `src/modules/ai/schemas/extraction.schema.ts`

**Purpose:** Output of PDF field extraction (Phase 3)

**Fields:**

| Field | Type | Description | DB Column |
|-------|------|-------------|-----------|
| `companyName` | string | Extracted company name | `startups.companyName` |
| `tagline` | string | One-line description | `startups.tagline` |
| `founderNames` | string[] | Founder names | (processed later) |
| `industry` | string | Industry/vertical | `startups.industry` |
| `stage` | string | Funding stage | `startups.stage` |
| `location` | string | Headquarters location | `startups.location` |
| `website` | string | Company website | `startups.website` |
| `fundingAsk` | number | Amount raising | Used in deal-terms eval |
| `valuation` | number | Pre-money valuation | Used in deal-terms eval |
| `rawText` | string | Full PDF text | Stored in Redis only |

---

### Synthesis Schema

**File:** `src/modules/ai/schemas/synthesis.schema.ts`

**Purpose:** Final synthesis output (Phase 7) mapping to DB

**Fields:**

| Field | Type | Description | DB Column |
|-------|------|-------------|-----------|
| `overallScore` | number (0-100) | Weighted final score | `startup_evaluations.overallScore` |
| `recommendation` | string | Pass/Consider/Decline | `startup_evaluations.recommendation` |
| `executiveSummary` | string | 2-3 paragraph summary | `startup_evaluations.executiveSummary` |
| `strengths` | string[] | Top 3-5 strengths | `startup_evaluations.strengths` |
| `concerns` | string[] | Top 3-5 concerns | `startup_evaluations.concerns` |
| `investmentThesis` | string | Why invest / why not | `startup_evaluations.investmentThesis` |
| `nextSteps` | string[] | Recommended actions | `startup_evaluations.nextSteps` |
| `confidenceLevel` | string | High/Medium/Low | `startup_evaluations.confidenceLevel` |

---

### Thesis Alignment Schema

**File:** `src/modules/ai/schemas/matching/thesis-alignment.schema.ts`

**Purpose:** Match startup to investor theses

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `thesisMatches` | array of objects | Matching theses |
| `alignmentScore` | number (0-100) | Overall thesis fit |
| `rationale` | string | Why it matches/doesn't |

**Thesis Match Object:**
```typescript
{
  thesisId: string;
  thesisName: string;
  matchScore: number; // 0-100
  matchingCriteria: string[];
  gaps: string[];
}
```

---

## Schema Registry

Create centralized schema maps for agent lookup.

**File:** `src/modules/ai/schemas/index.ts`

**Exports:**

```typescript
export const EVALUATION_SCHEMAS = {
  team: TeamEvaluationSchema,
  market: MarketEvaluationSchema,
  product: ProductEvaluationSchema,
  traction: TractionEvaluationSchema,
  businessModel: BusinessModelEvaluationSchema,
  gtm: GtmEvaluationSchema,
  financials: FinancialsEvaluationSchema,
  competitiveAdvantage: CompetitiveAdvantageEvaluationSchema,
  legal: LegalEvaluationSchema,
  dealTerms: DealTermsEvaluationSchema,
  exitPotential: ExitPotentialEvaluationSchema,
} as const;

export const RESEARCH_SCHEMAS = {
  teamResearch: TeamResearchSchema,
  marketResearch: MarketResearchSchema,
  productResearch: ProductResearchSchema,
  newsResearch: NewsResearchSchema,
} as const;

export type EvaluationAgentKey = keyof typeof EVALUATION_SCHEMAS; // Union of 11 keys
export type ResearchAgentKey = keyof typeof RESEARCH_SCHEMAS; // Union of 4 keys
```

**Validation:**
- `EVALUATION_SCHEMAS` must have exactly 11 entries
- `RESEARCH_SCHEMAS` must have exactly 4 entries
- All schemas must be valid Zod schemas

---

## Acceptance Criteria

### Schema Structure
- [ ] `BaseEvaluationSchema` defines all 6 shared fields
- [ ] All 11 evaluation schemas extend base schema
- [ ] All schemas use correct Zod types (number, string, array, object)
- [ ] Score fields constrained to 0-100 integers
- [ ] Confidence fields constrained to 0-1 decimals

### Schema Registry
- [ ] `EVALUATION_SCHEMAS` exports exactly 11 schemas
- [ ] `RESEARCH_SCHEMAS` exports exactly 4 schemas
- [ ] `EvaluationAgentKey` type is union of 11 keys
- [ ] `ResearchAgentKey` type is union of 4 keys

### Database Mapping
- [ ] Each evaluation schema maps to correct DB columns
- [ ] `{agent}Data` columns receive full schema output
- [ ] `{agent}Score` columns receive top-level score
- [ ] Additional columns map to specific fields

### Validation Rules
- [ ] Schemas parse valid data without errors
- [ ] Schemas reject negative scores
- [ ] Schemas reject scores > 100
- [ ] Schemas reject confidence > 1
- [ ] Schemas reject missing required fields

### Type Safety
- [ ] All schemas export inferred TypeScript types
- [ ] Zero TypeScript errors in `src/modules/ai/schemas/`
- [ ] Types match expected DB column structures

---

## Test Plan

### Test Strategy
One spec file per schema testing valid data parsing and rejection of invalid data.

### Test File: `base-evaluation.schema.spec.ts`

| Test Case | Input | Expected Behavior |
|-----------|-------|-------------------|
| Valid data | Complete object with all fields | Parses successfully |
| Negative score | `score: -10` | Throws ZodError |
| Score > 100 | `score: 150` | Throws ZodError |
| Decimal score | `score: 85.5` | Throws ZodError (must be integer) |
| Confidence > 1 | `confidence: 1.2` | Throws ZodError |
| Missing keyFindings | `keyFindings: []` | Throws ZodError (min 1 item) |

---

### Test File: `team.schema.spec.ts`

**Mock Data Inspired by Old Backend:**

```typescript
const validTeamEvaluation = {
  score: 85,
  confidence: 0.9,
  keyFindings: [
    'Strong technical founding team',
    'Previous startup experience',
  ],
  risks: ['No marketing expertise'],
  dataGaps: [],
  sources: ['https://linkedin.com/...'],
  founderQuality: 'Exceptional technical backgrounds',
  teamCompletion: 75,
  executionCapability: 'High likelihood of execution',
  founderMarketFitScore: 80,
  teamMembers: [
    {
      name: 'John Doe',
      role: 'CEO',
      background: 'Ex-Google engineer',
      strengths: ['Technical leadership'],
      concerns: ['Limited sales experience'],
    },
  ],
};
```

| Test Case | Expected Behavior |
|-----------|-------------------|
| Valid team eval | Parses successfully |
| Missing teamMembers | Throws ZodError |
| Invalid teamCompletion (>100) | Throws ZodError |

---

### Test File: `synthesis.schema.spec.ts`

**Mock Data:**

```typescript
const validSynthesis = {
  overallScore: 78,
  recommendation: 'Consider',
  executiveSummary: 'Strong team with promising market...',
  strengths: [
    'Experienced founders',
    'Large market opportunity',
    'Early traction',
  ],
  concerns: [
    'Competitive market',
    'High burn rate',
  ],
  investmentThesis: 'Worth deeper diligence...',
  nextSteps: ['Schedule founder interview', 'Review financials'],
  confidenceLevel: 'Medium',
};
```

| Test Case | Expected Behavior |
|-----------|-------------------|
| Valid synthesis | Parses successfully |
| Invalid recommendation | Throws ZodError (if not enum value) |
| Missing executiveSummary | Throws ZodError |

---

### Test File: `research/team-research.schema.spec.ts`

| Test Case | Expected Behavior |
|-----------|-------------------|
| Valid research data | Parses successfully |
| Missing required fields | Throws ZodError |
| Invalid LinkedIn profile structure | Throws ZodError |

---

## Implementation Notes

### Schema Composition Pattern
Use Zod's `.extend()` for inheritance:

```typescript
export const TeamEvaluationSchema = BaseEvaluationSchema.extend({
  founderQuality: z.string(),
  teamCompletion: z.number().int().min(0).max(100),
  // ... additional fields
});
```

### Optional vs Required Fields
- Base fields (score, confidence, keyFindings) are required
- risks, dataGaps, sources have `.default([])` for optional empty arrays
- Agent-specific fields should be required unless truly optional

### Enum Validation
For fixed options like `recommendation`:

```typescript
recommendation: z.enum(['Pass', 'Consider', 'Decline']),
```

### Array Constraints
Use `.min()` and `.max()` to enforce array length:

```typescript
keyFindings: z.array(z.string()).min(1).max(10),
```

### Number Constraints
Use `.int()` for integers, `.min()`, `.max()` for ranges:

```typescript
score: z.number().int().min(0).max(100),
confidence: z.number().min(0).max(1),
```

---

## Integration with Phase 1

### Dependencies
- None (schemas defined independently)
- Can be implemented fully in parallel with Phase 1

### Used By Future Phases
- Phase 3: `ExtractionSchema`
- Phase 5: All `RESEARCH_SCHEMAS`
- Phase 6: All `EVALUATION_SCHEMAS`
- Phase 7: `SynthesisSchema`, `ThesisAlignmentSchema`

---

## Success Checklist

Before marking Phase 2 complete:

- [ ] All 20 schema files created
- [ ] `schemas/index.ts` exports all schema registries
- [ ] All schemas extend base where appropriate
- [ ] All schemas have corresponding TypeScript types exported
- [ ] `bunx tsc --noEmit` passes with zero errors
- [ ] All schema tests pass (`bun test src/modules/ai/schemas/`)
- [ ] Each schema tested with valid + invalid data
- [ ] DB column mapping documented for each schema
- [ ] Schema registry has correct count (11 + 4)

---

## Next Phase

After Phase 2 completion, proceed to:
- **Phase 5:** Research Agents (requires Phase 1 + Phase 2)
- **Phase 6:** Evaluation Agents (requires Phase 2 + Phase 5)

Phase 2 does NOT block Phase 3 or Phase 4 (can continue in parallel).

---

**Document Version:** 1.0
**Last Updated:** 2026-02-07
**Assigned To:** Developer 2
