# Phase 1: Foundation & Providers

**Status:** Ready for Implementation
**Dependencies:** None (starting phase)
**Estimated Effort:** M (2-3 days)
**Parallelizable With:** Phase 02 (Zod Schemas)

---

## Goal

Stand up the `src/modules/ai/` NestJS module skeleton with AI provider wrappers, Redis-based pipeline state management, and dedicated BullMQ queues.

**Deliverables:**
- AI provider factory (OpenAI, Google, Mistral)
- Redis pipeline state service with 24h TTL
- 5 new BullMQ queues with concurrency configs
- Configuration service for model routing
- TypeScript interfaces for pipeline state

---

## Prerequisites

### Environment Variables Required
Add to `.env` and `src/config/env.schema.ts`:

```bash
# AI Providers
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=AI...
MISTRAL_API_KEY=...

# Pipeline Config
AI_PIPELINE_TIMEOUT=600000          # 10 minutes in ms
AI_MAX_RETRIES=3
AI_EXTRACTION_CONCURRENCY=5
AI_RESEARCH_CONCURRENCY=4
AI_EVALUATION_CONCURRENCY=11
```

### Packages to Install

```bash
bun add ai @ai-sdk/openai @ai-sdk/google @mistralai/mistralai pdf-parse
```

| Package | Version | Purpose |
|---------|---------|---------|
| `ai` | ^6.0.0 | Vercel AI SDK core (generateObject, generateText) |
| `@ai-sdk/openai` | ^1.0.0 | OpenAI provider for AI SDK |
| `@ai-sdk/google` | ^1.0.0 | Google Gemini provider for AI SDK |
| `@mistralai/mistralai` | ^1.0.0 | Mistral OCR client |
| `pdf-parse` | ^1.1.1 | Fast PDF text extraction |

---

## Deliverables

**TDD Order**: For each file below, create its `.spec.ts` test file FIRST with failing tests based on the acceptance criteria, then implement the service to make tests pass.

### New Files to Create

| File Path | Purpose | Key Exports |
|-----------|---------|-------------|
| `src/modules/ai/ai.module.ts` | NestJS module registration | `AiModule` |
| `src/modules/ai/ai.config.ts` | Queue names, model mappings, timeouts | `AI_QUEUES`, `MODEL_CONFIGS`, `QUEUE_CONCURRENCY` |
| `src/modules/ai/providers/ai-provider.service.ts` | AI client factory | `AiProviderService` with `getOpenAI()`, `getGemini()`, `getMistral()` |
| `src/modules/ai/services/pipeline-state.service.ts` | Redis state CRUD | `PipelineStateService` |
| `src/modules/ai/services/ai-config.service.ts` | Model config resolver | `AiConfigService` with `getModelConfig(purpose)` |
| `src/modules/ai/interfaces/pipeline.interface.ts` | Pipeline types | `PipelinePhase`, `PipelineState`, `PhaseStatus`, `ModelPurpose` |

### Files to Modify

| File Path | Changes Required |
|-----------|-----------------|
| `src/app.module.ts` | Import `AiModule` in `imports` array |
| `src/config/env.schema.ts` | Add AI provider keys + pipeline config vars |
| `src/queue/queue.config.ts` | Add 5 new queue names + concurrency configs |
| `src/queue/interfaces/job-data.interface.ts` | Add `AiPipelineBaseJobData` interface |
| `package.json` | Add new dependencies via `bun add` |

---

## Interfaces & Types

### PipelinePhase Enum
```typescript
export enum PipelinePhase {
  EXTRACTION = 'extraction',
  SCRAPING = 'scraping',
  RESEARCH = 'research',
  EVALUATION = 'evaluation',
  SYNTHESIS = 'synthesis',
  POST_PROCESSING = 'post_processing',
}
```

### PhaseStatus Enum
```typescript
export enum PhaseStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}
```

### PipelineState Interface
```typescript
interface PipelineState {
  startupId: string;
  userId: string;
  pipelineRunId: string;
  phases: Record<PipelinePhase, PhaseResult>;
  currentPhase: PipelinePhase;
  createdAt: Date;
  updatedAt: Date;
}

interface PhaseResult {
  status: PhaseStatus;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  error?: string;
  agentResults?: Record<string, unknown>;
}
```

### Telemetry Interfaces

```typescript
interface AgentTelemetry {
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  tokenUsage: {
    input: number;
    output: number;
  };
  model: string;
  retryCount: number;
  error?: string;
}

interface PhaseTelemetry {
  phase: PipelinePhase;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  agents: AgentTelemetry[];
  successCount: number;
  failedCount: number;
}

interface PipelineTelemetry {
  pipelineRunId: string;
  startupId: string;
  phases: PhaseTelemetry[];
  totalDurationMs: number;
  totalTokens: number;
  totalCost: number;
  bottleneckPhase: string;
  bottleneckAgent: string;
}
```

### ModelPurpose Enum
```typescript
export enum ModelPurpose {
  RESEARCH = 'research',
  OCR = 'ocr',
  FIELD_EXTRACTION = 'field_extraction',
  EVALUATION = 'evaluation',
  SYNTHESIS = 'synthesis',
  THESIS_ALIGNMENT = 'thesis_alignment',
  LOCATION_NORMALIZATION = 'location_normalization',
}
```

### ModelConfig Interface
```typescript
interface ModelConfig {
  modelId: string;
  provider: 'openai' | 'google' | 'mistral';
  maxTokens: number;
  temperature: number;
  timeout: number; // milliseconds
}
```

---

## Service Specifications

### AiProviderService

**Location:** `src/modules/ai/providers/ai-provider.service.ts`

**Methods:**

| Method | Return Type | Behavior |
|--------|-------------|----------|
| `getOpenAI()` | OpenAI provider instance | Lazy init, check `OPENAI_API_KEY`, cache instance |
| `getGemini()` | Google provider instance | Lazy init, check `GOOGLE_AI_API_KEY`, cache instance |
| `getMistral()` | Mistral client | Lazy init, check `MISTRAL_API_KEY`, cache instance |

**Error Handling:**
- Throw `ServiceUnavailableException` if API key missing
- Include which provider + env var name in error message

**Caching Strategy:**
- Initialize once per provider
- Store in private class properties
- Reuse across requests

---

### PipelineStateService

**Location:** `src/modules/ai/services/pipeline-state.service.ts`

**Redis Key Format:** `pipeline:{startupId}`
**TTL:** 24 hours (86400 seconds)

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `initState()` | `startupId`, `userId`, `pipelineRunId` | `Promise<void>` | Create new pipeline state hash |
| `getState()` | `startupId` | `Promise<PipelineState \| null>` | Fetch full state |
| `updatePhase()` | `startupId`, `phase`, `status`, `error?` | `Promise<void>` | Update phase status + timestamps |
| `setAgentResult()` | `startupId`, `phase`, `agentKey`, `result` | `Promise<void>` | Store agent output in phase.agentResults |
| `getAgentResult()` | `startupId`, `phase`, `agentKey` | `Promise<unknown \| null>` | Retrieve specific agent result |
| `setIntermediateData()` | `startupId`, `key`, `value` | `Promise<void>` | Store arbitrary data (e.g., PDF text) |
| `getIntermediateData()` | `startupId`, `key` | `Promise<unknown \| null>` | Retrieve intermediate data |
| `cleanupState()` | `startupId` | `Promise<void>` | Delete pipeline state (called after DB write) |

**Data Storage Format:**
- Use Redis hash with JSON.stringify for complex objects
- Store timestamps as ISO strings
- Use hash field names like `phases.extraction.status`

**TTL Behavior:**
- Set TTL on hash creation (initState)
- Extend TTL on every update (24h from last activity)
- Auto-cleanup via Redis expiration

---

### AiConfigService

**Location:** `src/modules/ai/services/ai-config.service.ts`

**Method:**
```typescript
getModelConfig(purpose: ModelPurpose): ModelConfig
```

**Model Mappings:**

| Purpose | Model ID | Provider | Max Tokens | Temperature | Timeout |
|---------|----------|----------|------------|-------------|---------|
| `RESEARCH` | `gemini-3-flash` | google | 4000 | 0.3 | 60000 |
| `OCR` | `mistral-ocr-latest` | mistral | 8000 | 0 | 120000 |
| `FIELD_EXTRACTION` | `gpt-4o-mini` | openai | 2000 | 0.1 | 30000 |
| `EVALUATION` | `gpt-4o` | openai | 4000 | 0.2 | 60000 |
| `SYNTHESIS` | `gpt-5.2` | openai | 8000 | 0.3 | 90000 |
| `THESIS_ALIGNMENT` | `gpt-4o` | openai | 3000 | 0.2 | 30000 |
| `LOCATION_NORMALIZATION` | `gpt-4o-mini` | openai | 500 | 0 | 10000 |

**Validation:**
- Throw error if unknown `ModelPurpose` provided
- Include purpose name in error message

---

## Queue Configuration

### Queue Names

Add to `src/modules/ai/ai.config.ts`:

```typescript
export const AI_QUEUES = {
  EXTRACTION: 'ai-extraction',
  SCRAPING: 'ai-scraping',
  RESEARCH: 'ai-research',
  EVALUATION: 'ai-evaluation',
  SYNTHESIS: 'ai-synthesis',
} as const;
```

### Concurrency Configuration

Add to `src/queue/queue.config.ts`:

| Queue Name | Concurrency | Rationale |
|------------|-------------|-----------|
| `ai-extraction` | 5 | Mistral OCR rate limits |
| `ai-scraping` | 3 | Avoid IP rate limits |
| `ai-research` | 4 | Match research agent count |
| `ai-evaluation` | 11 | Match evaluation agent count |
| `ai-synthesis` | 1 | Single synthesis agent |

### Job Data Interface

Add to `src/queue/interfaces/job-data.interface.ts`:

```typescript
export interface AiPipelineBaseJobData {
  startupId: string;
  userId: string;
  pipelineRunId: string;
  attempt: number;
}
```

---

## Acceptance Criteria

### Module Registration
- [ ] `AiModule` imports in `AppModule` without errors
- [ ] Module initializes on app startup
- [ ] No circular dependency warnings

### Provider Service
- [ ] `getOpenAI()` returns valid OpenAI provider when `OPENAI_API_KEY` set
- [ ] `getGemini()` returns valid Google provider when `GOOGLE_AI_API_KEY` set
- [ ] `getMistral()` returns valid Mistral client when `MISTRAL_API_KEY` set
- [ ] Each provider throws `ServiceUnavailableException` when API key missing
- [ ] Error messages include provider name + required env var

### Pipeline State Service
- [ ] `initState()` creates Redis hash with TTL
- [ ] `getState()` returns null for non-existent pipeline
- [ ] `updatePhase()` updates status and timestamps correctly
- [ ] `setAgentResult()` stores JSON data in correct hash field
- [ ] `getAgentResult()` retrieves stored data correctly
- [ ] `cleanupState()` deletes hash from Redis
- [ ] TTL extends to 24h on every state update

### Config Service
- [ ] `getModelConfig()` returns correct config for each `ModelPurpose`
- [ ] Throws error for invalid purpose enum value

### Queue Setup
- [ ] All 5 queues initialize on startup
- [ ] Each queue has correct concurrency setting
- [ ] Queues visible in BullMQ dashboard

### Type Safety
- [ ] Zero TypeScript errors in `src/modules/ai/`
- [ ] All enums export correctly
- [ ] Interfaces match expected shapes

---

## Test Plan

### Test File: `ai-provider.service.spec.ts`

**Mock Strategy:** Mock `ConfigService` to return/omit API keys

| Test Case | Setup | Expected Behavior |
|-----------|-------|-------------------|
| OpenAI initialization | Set `OPENAI_API_KEY` in mock | Returns provider instance |
| OpenAI missing key | Omit `OPENAI_API_KEY` from mock | Throws `ServiceUnavailableException` with message |
| Google initialization | Set `GOOGLE_AI_API_KEY` in mock | Returns provider instance |
| Mistral initialization | Set `MISTRAL_API_KEY` in mock | Returns client instance |
| Provider caching | Call `getOpenAI()` twice | Returns same instance (===) |

---

### Test File: `pipeline-state.service.spec.ts`

**Mock Strategy:** Mock `IORedis` with in-memory Map

| Test Case | Setup | Expected Behavior |
|-----------|-------|-------------------|
| Initialize state | Call `initState()` | Creates hash with correct structure |
| Get non-existent state | Call `getState()` with random ID | Returns null |
| Update phase status | Init state, call `updatePhase()` | Updates status + timestamps |
| Store agent result | Init state, call `setAgentResult()` | Stores JSON in hash |
| Retrieve agent result | Store result, call `getAgentResult()` | Returns stored data |
| Cleanup state | Init state, call `cleanupState()` | Hash deleted from Redis |
| TTL behavior | Init state, wait, update | TTL resets to 24h |

---

### Test File: `ai-config.service.spec.ts`

**Mock Strategy:** Mock `ConfigService` for timeout values

| Test Case | Expected Behavior |
|-----------|-------------------|
| Get research config | Returns `gemini-3-flash` config |
| Get OCR config | Returns `mistral-ocr-latest` config |
| Get evaluation config | Returns `gpt-4o` config |
| Get synthesis config | Returns `gpt-5.2` config |
| Invalid purpose | Throws error with purpose name |

---

## Implementation Notes

### Provider Initialization Pattern
- Use lazy initialization (don't create clients until first use)
- Cache instances in private class properties
- Check API keys only when provider requested
- Allow app to start even if keys missing (fail at runtime when used)

### Redis State Design
- Use hash for structured data (vs single JSON blob)
- Enables atomic updates of specific fields
- Better performance for partial reads
- Easier debugging via Redis CLI

### Error Handling Strategy
- Providers throw `ServiceUnavailableException` (HTTP 503)
- State service throws `InternalServerErrorException` for Redis failures
- Config service throws `BadRequestException` for invalid purpose

### Logging Requirements
- Log provider initialization (info level)
- Log pipeline state transitions (debug level)
- Log Redis errors (error level)
- Include `startupId` and `pipelineRunId` in all logs

---

## Integration Points

### With Existing Modules

| Module | Integration Point | Usage |
|--------|------------------|-------|
| `ConfigModule` | Provider API keys | Read env vars for auth |
| `QueueModule` | Queue registration | Add 5 new queues |
| `DatabaseModule` | Final persistence | Write synthesis results |
| `NotificationModule` | Pipeline events | Notify on completion/failure |

### With Future Phases

| Phase | Dependencies from Phase 1 |
|-------|---------------------------|
| Phase 3 (Extraction) | `AiProviderService.getMistral()`, `PipelineStateService` |
| Phase 4 (Scraping) | `PipelineStateService`, queue setup |
| Phase 5 (Research) | `AiProviderService.getGemini()`, `AiConfigService`, state service |
| Phase 6 (Evaluation) | `AiProviderService.getOpenAI()`, config service, state service |
| Phase 7 (Synthesis) | All services from Phase 1 |
| Phase 8 (Orchestrator) | All queues, state service |

---

## Success Checklist

Before marking Phase 1 complete:

- [ ] All 6 new files created with correct exports
- [ ] All 5 modified files updated
- [ ] `bun install` succeeds with new packages
- [ ] `bunx tsc --noEmit` passes with zero errors
- [ ] `bun lint` passes with zero warnings
- [ ] All unit tests pass (`bun test src/modules/ai/`)
- [ ] App starts without errors (`bun run start:dev`)
- [ ] All 5 queues visible in BullMQ dashboard
- [ ] Redis pipeline state CRUD tested manually
- [ ] Provider initialization tested with missing keys

---

## Next Phase

After Phase 1 completion, proceed to:
- **Phase 2:** Zod Schemas (can be done in parallel)
- **Phase 3:** PDF Extraction (requires Phase 1)

---

**Document Version:** 1.0
**Last Updated:** 2026-02-07
**Assigned To:** Developer 1
