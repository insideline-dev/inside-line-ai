# Phase 5: Research Agents (Gemini 3 Flash + Google Search Grounding)

**Status:** Not Started
**Estimated Effort:** L (3-4 days)
**Dependencies:** Phase 1 (Foundation), Phase 2 (Schemas)

---

## Goal

Build 4 parallel research agents powered by Gemini 3 Flash with Google Search grounding. Each agent investigates a specific dimension (team, market, product, news) and returns structured data with citations.

---

## Technical Architecture

### Gemini Grounding Pattern (AI SDK v6)

The implementation uses `generateText()` with `google.tools.googleSearch({})` as a tool, not `generateObject()`. Key differences:

- **Model:** `google('gemini-3.0-flash')`
- **Method:** `generateText()` - grounding works better with text generation than structured output
- **Grounding Flow:** Model receives real-time Google Search results → synthesizes information → returns text response
- **Post-Processing:** Parse grounded text into Zod-validated structures
- **Citations:** Available in `response.sources` array
- **Detailed Metadata:** `response.providerMetadata?.google?.groundingMetadata` contains `groundingChunks` with URLs and snippets

### Agent Architecture

Each research agent is a configuration object, not a class:

```typescript
interface ResearchAgentConfig {
  key: ResearchAgentKey;
  name: string;
  systemPrompt: string;
  humanPromptTemplate: string; // Mustache template
  schema: ZodSchema;
  contextBuilder: (pipelineData: PipelineData) => AgentContext;
}
```

---

## Deliverables

| File | Responsibility |
|------|----------------|
| `src/modules/ai/research/research.module.ts` | NestJS sub-module registration |
| `src/modules/ai/research/gemini-research.service.ts` | Core wrapper for AI SDK's `generateText()` with `googleSearch` tool. Handles grounding metadata extraction, citation parsing from `groundingMetadata.groundingChunks`, source URL collection. Primary method: `research(prompt, systemPrompt)` returns `{ text, sources[], groundingMetadata }` |
| `src/modules/ai/research/agents/team-research.agent.ts` | Agent config + prompt for team research: founder backgrounds, past exits, patents, achievements, education, LinkedIn profiles |
| `src/modules/ai/research/agents/market-research.agent.ts` | Agent config + prompt: TAM/SAM/SOM validation, market growth rates, industry trends, market drivers, regulatory landscape, geographic considerations |
| `src/modules/ai/research/agents/product-research.agent.ts` | Agent config + prompt: competitor product analysis, feature comparison, tech stack identification, customer reviews, product positioning |
| `src/modules/ai/research/agents/news-research.agent.ts` | Agent config + prompt: press releases, funding announcements, partnerships, regulatory news, media coverage (last 12 months) |
| `src/modules/ai/research/agents/index.ts` | Agent registry: `RESEARCH_AGENTS: Record<ResearchAgentKey, ResearchAgentConfig>` with all 4 agents. Barrel export |
| `src/modules/ai/research/research.service.ts` | Orchestrator: runs all 4 agents in parallel via `Promise.allSettled()`. Collects results + sources. Stores to pipeline state (Redis). Handles partial failures gracefully |
| `src/modules/ai/research/research.processor.ts` | BullMQ processor for `ai-research` queue. Job payload: `{ startupId, jobId }`. Emits WebSocket events on completion/failure |

---

## Context Engineering Per Agent

**Critical:** Each agent receives ONLY relevant context to prevent prompt bloat and improve grounding accuracy.

### Team Research Agent Context
- `companyName: string`
- `teamMembers: Array<{ name, role, linkedinUrl? }>`
- `companyDescription: string`
- `industry: string`
- `websiteUrl?: string`

**Excludes:** Market TAM, financial projections, competitor data, product features

### Market Research Agent Context
- `industry: string`
- `claimedTAM?: number`
- `geographicFocus?: string[]`
- `companyDescription: string`
- `targetMarket?: string`

**Excludes:** Team member details, product tech stack, financial numbers, news items

### Product Research Agent Context
- `productDescription: string`
- `knownCompetitors?: string[]`
- `websiteProductPages?: string[]`
- `demoUrl?: string`
- `extractedFeatures?: string[]`

**Excludes:** Team LinkedIn data, market TAM validation, financial projections

### News Research Agent Context
- `companyName: string`
- `industry: string`
- `geographicFocus?: string`
- `foundingDate?: string`
- `knownFunding?: Array<{ date, amount }>`

**Excludes:** Team deep research, competitor details, product features

---

## Data Flow

1. **Trigger:** `ai-research` job added to queue with `{ startupId, jobId }`
2. **State Load:** Processor loads pipeline data from Redis via `PipelineStateService`
3. **Context Building:** Each agent's `contextBuilder()` extracts relevant fields
4. **Parallel Execution:** `Promise.allSettled()` runs all 4 agents
5. **Response Processing:**
   - Text response parsed against agent's Zod schema
   - Sources extracted from `groundingMetadata.groundingChunks`
   - Each source becomes `SourceEntry` with URL, type, agent name, timestamp
6. **Deduplication:** Sources merged and deduplicated by URL
7. **State Storage:** Results written to Redis:
   - `research.team`
   - `research.market`
   - `research.product`
   - `research.news`
   - `research.sources[]`
   - `research.errors[]` (for failed agents)
8. **WebSocket:** Emit `ai-research:complete` or `ai-research:failed`

---

## Key Interfaces

### SourceEntry
```typescript
interface SourceEntry {
  name: string;
  url?: string;
  type: 'document' | 'website' | 'linkedin' | 'api' | 'search';
  agent: ResearchAgentKey;
  timestamp: string; // ISO 8601
}
```

### ResearchResults
```typescript
interface ResearchResults {
  team: TeamResearchOutput | null;
  market: MarketResearchOutput | null;
  product: ProductResearchOutput | null;
  news: NewsResearchOutput | null;
  sources: SourceEntry[];
  errors: Array<{ agent: ResearchAgentKey; error: string }>;
}
```

### ResearchAgentKey
```typescript
type ResearchAgentKey = 'team' | 'market' | 'product' | 'news';
```

---

## Acceptance Criteria

### Context Engineering
- [ ] Team agent context contains ONLY: company name, team members, company description, industry, website
- [ ] Market agent context contains ONLY: industry, claimed TAM, geographic focus, company description, target market
- [ ] Product agent context contains ONLY: product description, competitors, website product pages, demo URL, extracted features
- [ ] News agent context contains ONLY: company name, industry, geographic focus, founding date, known funding

### Gemini Grounding
- [ ] All agents use `google('gemini-3.0-flash')`
- [ ] All agents call `generateText()` with `google.tools.googleSearch({})`
- [ ] Citations extracted from `providerMetadata.google.groundingMetadata.groundingChunks`
- [ ] Each citation stored as `SourceEntry` with URL, type, agent, timestamp

### Parallel Execution
- [ ] All 4 agents run in parallel via `Promise.allSettled()`
- [ ] One agent failure does NOT affect others
- [ ] Failed agents: result = null, error logged to `research.errors[]`

### Data Storage
- [ ] Results stored in Redis under `pipeline:{jobId}` with TTL
- [ ] Keys: `research.team`, `research.market`, `research.product`, `research.news`
- [ ] All sources deduplicated by URL before storage
- [ ] Each output validates against its Zod schema before storage

### WebSocket Events
- [ ] Emit `ai-research:complete` with `{ startupId, jobId, results }`
- [ ] Emit `ai-research:failed` with `{ startupId, jobId, error }` on total failure

---

## Test Plan

### Unit Tests

| Test File | Focus | Mock Strategy |
|-----------|-------|---------------|
| `gemini-research.service.spec.ts` | Source extraction, grounding metadata parsing | Mock AI SDK `generateText()`. Return canned response with `providerMetadata.google.groundingMetadata`. Verify `SourceEntry[]` extraction. Test citation deduplication |
| `team-research.agent.spec.ts` | Context building, prompt interpolation | Mock pipeline data. Call `contextBuilder()`. Verify output contains ONLY team-relevant fields. Verify systemPrompt and humanPromptTemplate are non-empty strings |
| `market-research.agent.spec.ts` | Context building | Verify context excludes team LinkedIn, product features, financial data |
| `product-research.agent.spec.ts` | Context building | Verify context excludes team data, market TAM, news items |
| `news-research.agent.spec.ts` | Context building | Verify context excludes team deep research, competitor details |
| `research.service.spec.ts` | Parallel execution, error handling | Mock `GeminiResearchService`. Simulate 1 agent failure. Verify 3 succeed + 1 error in `errors[]`. Verify `Promise.allSettled()` usage |
| `research.processor.spec.ts` | BullMQ integration | Mock `ResearchService.run()`. Verify job completion. Verify WebSocket emit |

### Integration Test

| Test File | Focus |
|-----------|-------|
| `research.integration.spec.ts` | Real Gemini call (test environment only). Verify grounding sources returned. Verify Zod validation |

---

## Reference Files

### Old Backend
- **Prompts:** `old-backend/sync-prompts-inline.ts`
  - Line ~150: `teamDeepResearch` prompt
  - Line ~200: `marketDeepResearch` prompt
  - Line ~250: `productDeepResearch` prompt
  - Line ~300: `newsSearch` prompt
- **Types:** `old-backend/research-orchestrator.ts`
  - Line ~50: `TeamMemberResearch` interface
  - Line ~120: `MarketResearch` interface
  - Line ~180: `ProductResearch` interface

### Current Schemas
- `src/modules/ai/schemas/research/team-research.schema.ts`
- `src/modules/ai/schemas/research/market-research.schema.ts`
- `src/modules/ai/schemas/research/product-research.schema.ts`
- `src/modules/ai/schemas/research/news-research.schema.ts`

---

## Implementation Notes

1. **Prompt Templates:** Use Mustache for variable interpolation in `humanPromptTemplate`
2. **Error Handling:** Never throw on individual agent failure - collect errors in `errors[]`
3. **Source Deduplication:** Use `Map<url, SourceEntry>` to dedupe by URL
4. **Grounding Metadata:** Parse `groundingChunks[].web.uri` for URLs, `groundingChunks[].web.title` for names
5. **Schema Validation:** If Zod parse fails, log error and store null result

---

## Timeline Estimate

- Day 1: `GeminiResearchService` + tests
- Day 2: Agent configs (4 agents) + context builders + tests
- Day 3: `ResearchService` orchestrator + parallel execution + tests
- Day 4: Processor + WebSocket + integration test
