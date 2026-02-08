# Phase 6: Evaluation Agents (11 Agents, GPT-4o)

**Status:** Not Started
**Estimated Effort:** L (4-5 days)
**Dependencies:** Phase 2 (Schemas), Phase 5 (Research)

---

## Goal

Build 11 evaluation agents analyzing startup data across all investment dimensions. Each uses GPT-4o via AI SDK's `generateObject()` with its specific Zod schema. **Critical success factor:** Context engineering - each agent receives ONLY relevant data.

---

## Technical Architecture

### Agent Pattern

Abstract base class with template method pattern:

```typescript
abstract class BaseEvaluationAgent<TOutput extends BaseEvaluationOutput> {
  abstract buildContext(pipelineData: PipelineData): AgentContext;
  async run(pipelineData: PipelineData): Promise<TOutput>;
  validate(output: unknown): TOutput;
}
```

Each concrete agent:
1. Implements `buildContext()` to extract relevant fields
2. Inherits `run()` which calls `generateObject()` with GPT-4o
3. Inherits `validate()` which parses with agent's Zod schema

### Model Configuration

- **Model:** `openai('gpt-4o')`
- **Method:** `generateObject()` with agent's Zod schema
- **Temperature:** 0.3 (deterministic but not rigid)
- **Max Tokens:** 4000 per agent

---

## The 11 Evaluation Agents

| Agent Key | Evaluates | Primary Output Columns |
|-----------|-----------|------------------------|
| `team` | Founder backgrounds, experience, execution capability | `teamData`, `teamScore`, `teamMemberEvaluations`, `founderMarketFit`, `executionRiskNotes`, `teamComposition` |
| `market` | Market size, growth, competitive landscape | `marketData`, `marketScore`, `tamValidation`, `marketCredibility` |
| `product` | Product viability, features, tech stack | `productData`, `productScore`, `productSummary`, `extractedFeatures`, `extractedTechStack` |
| `traction` | User growth, revenue, engagement metrics | `tractionData`, `tractionScore`, `momentumScore`, `tractionCredibility` |
| `businessModel` | Revenue model, unit economics, scalability | `businessModelData`, `businessModelScore` |
| `gtm` | Go-to-market strategy, distribution, customer acquisition | `gtmData`, `gtmScore` |
| `financials` | Financial projections, burn rate, runway | `financialsData`, `financialsScore` |
| `competitiveAdvantage` | Defensibility, moats, differentiation | `competitiveAdvantageData`, `competitiveAdvantageScore` |
| `legal` | Compliance, IP, regulatory risks | `legalData`, `legalScore` |
| `dealTerms` | Valuation, terms, investment structure | `dealTermsData`, `dealTermsScore` |
| `exitPotential` | Acquisition likelihood, IPO potential, market exits | `exitPotentialData`, `exitPotentialScore` |

---

## Deliverables

| File | Responsibility |
|------|----------------|
| `src/modules/ai/evaluation/evaluation.module.ts` | NestJS sub-module registration |
| `src/modules/ai/evaluation/base-evaluation-agent.ts` | Abstract base class with `buildContext()`, `run()`, `validate()` methods. Generic over `TOutput` type |
| `src/modules/ai/evaluation/agents/team.agent.ts` | Team evaluation agent. Context: team members, LinkedIn data, team research, company description |
| `src/modules/ai/evaluation/agents/market.agent.ts` | Market evaluation. Context: market research, industry, TAM claims, competitive landscape |
| `src/modules/ai/evaluation/agents/product.agent.ts` | Product evaluation. Context: product research, deck product section, website product pages, demo URL |
| `src/modules/ai/evaluation/agents/traction.agent.ts` | Traction evaluation. Context: metrics from deck, news research (funding/partnerships), stage |
| `src/modules/ai/evaluation/agents/business-model.agent.ts` | Business model evaluation. Context: deck business model section, pricing, revenue model |
| `src/modules/ai/evaluation/agents/gtm.agent.ts` | GTM evaluation. Context: website marketing pages, target market, distribution channels |
| `src/modules/ai/evaluation/agents/financials.agent.ts` | Financial evaluation. Context: projections, funding target, previous funding, valuation |
| `src/modules/ai/evaluation/agents/competitive-advantage.agent.ts` | Competitive advantage evaluation. Context: competitor research, product features, patents |
| `src/modules/ai/evaluation/agents/legal.agent.ts` | Legal evaluation. Context: regulatory landscape, location, compliance mentions |
| `src/modules/ai/evaluation/agents/deal-terms.agent.ts` | Deal terms evaluation. Context: funding target, valuation, raise type, lead status |
| `src/modules/ai/evaluation/agents/exit-potential.agent.ts` | Exit potential evaluation. Context: market size, competitor M&A history, business model scalability |
| `src/modules/ai/evaluation/agents/index.ts` | Barrel export + registry: `EVALUATION_AGENTS: Map<EvaluationAgentKey, typeof BaseEvaluationAgent>` |
| `src/modules/ai/evaluation/agent-registry.service.ts` | Dependency injection container for agent instances. Methods: `getAgent(key)`, `getAllAgents()`, `runAll(pipelineData)` |
| `src/modules/ai/evaluation/evaluation.service.ts` | Orchestrator: loads pipeline data from Redis, runs all 11 via `runAll()`, stores results to `startup_evaluations` DB table + Redis |
| `src/modules/ai/evaluation/evaluation.processor.ts` | BullMQ processor for `ai-evaluation` queue. Emits per-agent WebSocket events |

---

## Context Engineering (MOST CRITICAL PART)

**Rule:** Each agent receives ONLY fields relevant to its evaluation. Irrelevant data increases token cost and degrades accuracy.

### Team Agent Context

**Includes:**
- `teamMembers: TeamMember[]` (from deck extraction)
- `linkedinProfiles: LinkedInProfile[]` (from LinkedIn enrichment)
- `teamResearch: TeamResearchOutput` (from research phase)
- `companyDescription: string`
- `industry: string`

**Excludes:**
- Financial projections
- Market TAM numbers
- Competitor feature comparisons
- News items
- Deal terms

### Market Agent Context

**Includes:**
- `marketResearch: MarketResearchOutput`
- `industry: string`
- `claimedTAM?: number` (from deck)
- `targetMarket?: string`
- `competitiveLandscape?: CompetitorInfo[]`

**Excludes:**
- Team LinkedIn profiles
- Team deep research
- Financial projections
- Deal terms
- Legal compliance data

### Product Agent Context

**Includes:**
- `productResearch: ProductResearchOutput`
- `deckProductSection?: ExtractedSection`
- `websiteProductPages?: string[]`
- `demoUrl?: string`
- `extractedFeatures?: string[]`

**Excludes:**
- Team member bios
- Market TAM validation
- Financial burn rate
- News coverage
- Legal regulatory landscape

### Traction Agent Context

**Includes:**
- `tractionMetrics: TractionMetrics` (from deck)
- `newsResearch: NewsResearchOutput` (funding announcements, partnerships)
- `stage: StartupStage`
- `previousFunding?: FundingRound[]`

**Excludes:**
- Team LinkedIn deep dive
- Competitor funding history
- Legal compliance
- Deal terms
- Product tech stack

### Business Model Agent Context

**Includes:**
- `deckBusinessModelSection?: ExtractedSection`
- `pricing?: PricingInfo` (from website)
- `revenueModel?: string`
- `unitEconomics?: UnitEconomics`

**Excludes:**
- Team deep research
- Competitor feature comparison
- Legal regulatory data
- News items
- Exit M&A history

### GTM Agent Context

**Includes:**
- `websiteMarketingPages?: string[]`
- `targetMarket?: string`
- `distributionChannels?: string[]`
- `customerAcquisitionStrategy?: string`

**Excludes:**
- Team LinkedIn profiles
- Financial projections
- Deal terms
- Competitor tech stacks
- Legal compliance

### Financials Agent Context

**Includes:**
- `financialProjections: FinancialProjections`
- `fundingTarget?: number`
- `previousFunding?: FundingRound[]`
- `currentValuation?: number`
- `burnRate?: number`

**Excludes:**
- Team deep research
- Competitor features
- News items (except funding)
- Legal regulatory landscape
- Product tech stack

### Competitive Advantage Agent Context

**Includes:**
- `productResearch: ProductResearchOutput` (competitor analysis)
- `extractedFeatures?: string[]`
- `patents?: Patent[]` (from team research)
- `techStack?: string[]`

**Excludes:**
- Financial projections
- News coverage
- Legal compliance
- Team LinkedIn backgrounds
- Deal terms

### Legal Agent Context

**Includes:**
- `industry: string` (regulatory landscape)
- `location: string` (jurisdiction)
- `complianceMentions?: string[]`
- `marketResearch.regulatoryLandscape`

**Excludes:**
- Team LinkedIn profiles
- Market TAM numbers
- Competitor product features
- Financial burn rate
- Deal terms

### Deal Terms Agent Context

**Includes:**
- `fundingTarget: number`
- `currentValuation?: number`
- `raiseType: 'equity' | 'safe' | 'convertible'`
- `leadInvestorStatus?: boolean`
- `investorRights?: string[]`

**Excludes:**
- Team deep research
- Competitor features
- News items
- Legal regulatory landscape
- Product tech stack

### Exit Potential Agent Context

**Includes:**
- `marketSize: number` (validated TAM)
- `competitorMandA?: AcquisitionHistory[]`
- `businessModelScalability?: string`
- `marketResearch.exitOpportunities`

**Excludes:**
- Team LinkedIn profiles
- Pricing details
- Legal compliance
- News coverage
- Product features

---

## Data Flow

1. **Trigger:** `ai-evaluation` job added with `{ startupId, jobId }`
2. **State Load:** Load pipeline data from Redis via `PipelineStateService`
3. **Agent Execution:**
   - `AgentRegistryService.runAll(pipelineData)` calls `Promise.allSettled()` on all 11 agents
   - Each agent:
     1. Calls `buildContext(pipelineData)` to extract relevant fields
     2. Calls `generateObject()` with GPT-4o + agent's Zod schema
     3. Validates output with `validate()`
     4. Returns `{ output, durationMs }` or `{ error }`
4. **Results Aggregation:**
   - Collect all outputs in `EvaluationResults` object
   - Count `completedCount` and `failedCount`
5. **DB Storage:** Write to `startup_evaluations` table (11 jsonb columns + 11 score columns)
6. **Redis Storage:** Store results under `pipeline:{jobId}` with TTL
7. **WebSocket Events:** Emit per-agent completion + final `ai-evaluation:complete`

---

## Key Interfaces

### BaseEvaluationAgent
```typescript
abstract class BaseEvaluationAgent<TOutput extends BaseEvaluationOutput> {
  readonly agentKey: EvaluationAgentKey;
  readonly name: string;
  readonly schema: ZodSchema<TOutput>;
  readonly systemPrompt: string;
  readonly humanPromptTemplate: string;

  abstract buildContext(pipelineData: PipelineData): AgentContext;
  async run(pipelineData: PipelineData): Promise<TOutput>;
  protected validate(output: unknown): TOutput;
}
```

### AgentContext
```typescript
type AgentContext = Record<string, unknown>;
// Each agent defines its own context shape via buildContext()
```

### EvaluationResults
```typescript
interface EvaluationResults {
  team: TeamEvaluationOutput | null;
  market: MarketEvaluationOutput | null;
  product: ProductEvaluationOutput | null;
  traction: TractionEvaluationOutput | null;
  businessModel: BusinessModelEvaluationOutput | null;
  gtm: GtmEvaluationOutput | null;
  financials: FinancialsEvaluationOutput | null;
  competitiveAdvantage: CompetitiveAdvantageEvaluationOutput | null;
  legal: LegalEvaluationOutput | null;
  dealTerms: DealTermsEvaluationOutput | null;
  exitPotential: ExitPotentialEvaluationOutput | null;
  completedCount: number;
  failedCount: number;
  errors: Array<{ agent: EvaluationAgentKey; error: string }>;
}
```

### EvaluationAgentKey
```typescript
type EvaluationAgentKey =
  | 'team'
  | 'market'
  | 'product'
  | 'traction'
  | 'businessModel'
  | 'gtm'
  | 'financials'
  | 'competitiveAdvantage'
  | 'legal'
  | 'dealTerms'
  | 'exitPotential';
```

---

## Database Writes

Each agent writes to `startup_evaluations` table:

| Agent | JSONB Column | Score Column | Additional Columns |
|-------|--------------|--------------|-------------------|
| team | `teamData` | `teamScore` | `teamMemberEvaluations`, `founderMarketFit`, `executionRiskNotes`, `teamComposition` |
| market | `marketData` | `marketScore` | `tamValidation`, `marketCredibility` |
| product | `productData` | `productScore` | `productSummary`, `extractedFeatures`, `extractedTechStack` |
| traction | `tractionData` | `tractionScore` | `momentumScore`, `tractionCredibility` |
| businessModel | `businessModelData` | `businessModelScore` | - |
| gtm | `gtmData` | `gtmScore` | - |
| financials | `financialsData` | `financialsScore` | - |
| competitiveAdvantage | `competitiveAdvantageData` | `competitiveAdvantageScore` | - |
| legal | `legalData` | `legalScore` | - |
| dealTerms | `dealTermsData` | `dealTermsScore` | - |
| exitPotential | `exitPotentialData` | `exitPotentialScore` | - |

**Schema Reference:** `src/modules/analysis/entities/analysis.schema.ts` lines 90-290

---

## Acceptance Criteria

### Context Engineering
- [ ] Team agent context includes: teamMembers, linkedinProfiles, teamResearch, companyDescription, industry
- [ ] Team agent context excludes: financialProjections, marketTAM, competitorFeatures
- [ ] Market agent context includes: marketResearch, industry, claimedTAM, targetMarket, competitiveLandscape
- [ ] Market agent context excludes: linkedinProfiles, teamResearch, financialProjections, dealTerms
- [ ] Product agent context includes: productResearch, deckProductSection, websiteProductPages, demoUrl, extractedFeatures
- [ ] Product agent context excludes: teamMemberBios, marketTAM, financialBurnRate, newsItems
- [ ] Each of 11 agents has verified context inclusion/exclusion lists

### AI SDK Integration
- [ ] All agents use `openai('gpt-4o')`
- [ ] All agents call `generateObject()` with agent's Zod schema
- [ ] Temperature set to 0.3 for all agents
- [ ] Max tokens: 4000 per agent

### Parallel Execution
- [ ] All 11 agents run via `Promise.allSettled()`
- [ ] One agent failure does NOT affect others
- [ ] Failed agents: output = null, error logged to `errors[]`
- [ ] `completedCount` and `failedCount` accurately tracked

### Database Storage
- [ ] All 11 outputs written to correct JSONB columns in `startup_evaluations`
- [ ] All 11 scores written to correct score columns (type: real)
- [ ] Additional columns (teamMemberEvaluations, founderMarketFit, etc.) written correctly
- [ ] DB write uses transaction for atomicity

### Redis Storage
- [ ] Results stored under `pipeline:{jobId}` with TTL
- [ ] Keys: `evaluation.team`, `evaluation.market`, etc.
- [ ] Errors stored in `evaluation.errors[]`

### WebSocket Events
- [ ] Emit per-agent completion: `ai-evaluation:agent-complete` with `{ agent, output }`
- [ ] Emit final completion: `ai-evaluation:complete` with `{ startupId, jobId, results }`
- [ ] Emit failure: `ai-evaluation:failed` with `{ startupId, jobId, error }`

---

## Test Plan

### Unit Tests

| Test File | Focus | Mock Strategy |
|-----------|-------|---------------|
| `base-evaluation-agent.spec.ts` | Template method pattern, schema validation | Create concrete test implementation. Mock `generateObject()`. Verify `buildContext()` called before `run()`. Verify schema validation on output |
| `team.agent.spec.ts` | Context building | Mock pipeline data with all fields. Call `buildContext()`. Verify output contains ONLY: teamMembers, linkedinProfiles, teamResearch, companyDescription, industry. Verify excludes: financialProjections, marketTAM, competitorFeatures |
| `market.agent.spec.ts` | Context building | Verify context includes: marketResearch, industry, claimedTAM. Verify excludes: linkedinProfiles, financialProjections |
| `product.agent.spec.ts` | Context building | Verify context includes: productResearch, deckProductSection. Verify excludes: teamResearch, marketTAM, newsItems |
| `traction.agent.spec.ts` | Context building | Verify context includes: tractionMetrics, newsResearch, stage. Verify excludes: teamLinkedIn, competitorFunding, legal |
| `business-model.agent.spec.ts` | Context building | Verify context includes: deckBusinessModelSection, pricing, revenueModel. Verify excludes: teamResearch, competitorFeatures, legal |
| `gtm.agent.spec.ts` | Context building | Verify context includes: websiteMarketingPages, targetMarket, distributionChannels. Verify excludes: linkedinProfiles, financialProjections, dealTerms |
| `financials.agent.spec.ts` | Context building | Verify context includes: financialProjections, fundingTarget, previousFunding. Verify excludes: teamResearch, competitorFeatures, newsItems |
| `competitive-advantage.agent.spec.ts` | Context building | Verify context includes: productResearch, patents, techStack. Verify excludes: financialProjections, newsItems, legal |
| `legal.agent.spec.ts` | Context building | Verify context includes: industry, location, complianceMentions, regulatoryLandscape. Verify excludes: linkedinProfiles, marketTAM, competitorFeatures |
| `deal-terms.agent.spec.ts` | Context building | Verify context includes: fundingTarget, valuation, raiseType, leadInvestorStatus. Verify excludes: teamResearch, competitorFeatures, newsItems |
| `exit-potential.agent.spec.ts` | Context building | Verify context includes: marketSize, competitorMandA, businessModelScalability. Verify excludes: linkedinProfiles, pricingDetails, legal |
| `agent-registry.service.spec.ts` | Agent instantiation, parallel execution | Mock all 11 agents. Call `runAll()`. Simulate 2 agent failures. Verify 9 succeed + completedCount = 9, failedCount = 2 |
| `evaluation.service.spec.ts` | Orchestration, DB writes | Mock `AgentRegistryService`. Mock `PipelineStateService`. Mock Drizzle DB. Verify all 11 columns written. Verify transaction usage |
| `evaluation.processor.spec.ts` | BullMQ integration | Mock `EvaluationService.run()`. Verify job completion. Verify WebSocket emits (per-agent + final) |

### Integration Test

| Test File | Focus |
|-----------|-------|
| `evaluation.integration.spec.ts` | Real GPT-4o calls (test environment only). Verify all 11 agents return valid outputs. Verify DB writes |

---

## Reference Files

### Old Backend
- **Prompts:** `old-backend/sync-prompts-inline.ts`
  - Line ~400: Team evaluation prompt
  - Line ~500: Market evaluation prompt
  - Line ~600: Product evaluation prompt
  - Line ~700: Traction evaluation prompt
  - (Continue for all 11 agents)
- **Agent Implementations:** `old-backend/langchain-agents.ts`
  - Line 2380: `TeamAgent` class
  - Line 2605: `MarketAgent` class
  - Line 2830: `ProductAgent` class
  - (Continue for all 11 agents)

### Current Schemas
- `src/modules/ai/schemas/evaluation/team.schema.ts`
- `src/modules/ai/schemas/evaluation/market.schema.ts`
- `src/modules/ai/schemas/evaluation/product.schema.ts`
- (Continue for all 11 agents)

### Database Schema
- `src/modules/analysis/entities/analysis.schema.ts` lines 90-290
  - All 11 JSONB columns
  - All 11 score columns
  - Additional columns (teamMemberEvaluations, founderMarketFit, etc.)

---

## Implementation Notes

1. **Base Class Generic:** `BaseEvaluationAgent<TOutput extends BaseEvaluationOutput>` ensures type safety
2. **Context Builder Pattern:** Each agent implements `buildContext()` with strict field filtering
3. **Error Handling:** Never throw on agent failure - return `{ error }` and continue
4. **Schema Validation:** Call `schema.parse()` in `validate()` method. Throw if invalid (caught by `runAll()`)
5. **DB Transaction:** Use Drizzle transaction to ensure atomic write of all 11 columns
6. **WebSocket Granularity:** Emit per-agent events for frontend progress UI
7. **Registry Pattern:** Use Map for O(1) agent lookup by key

---

## Timeline Estimate

- Day 1: `BaseEvaluationAgent` + `AgentRegistryService` + tests
- Day 2: Agents 1-6 (team, market, product, traction, businessModel, gtm) + context builders + tests
- Day 3: Agents 7-11 (financials, competitiveAdvantage, legal, dealTerms, exitPotential) + tests
- Day 4: `EvaluationService` orchestrator + DB writes + tests
- Day 5: Processor + WebSocket + integration test
