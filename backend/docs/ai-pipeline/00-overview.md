# AI Pipeline Implementation Plan - Master Overview

**Status:** Draft
**Date:** 2026-02-07
**Author:** Product & Engineering Team

## Goal

Migrate startup analysis from old LangChain monolith (`old-backend/`) to modern AI SDK v6 architecture with BullMQ orchestration. Replace slow sequential processing with parallelized agent execution.

**Current Performance:** 25-45 minutes per startup
**Target Performance:** <10 minutes per startup

**No Database Migration Required:** All outputs write to existing `startup_evaluations` table.

---

## Phase Dependency Graph

```
Phase 1: Foundation ──────────┐
                              ├──> Phase 3: PDF Extraction
Phase 2: Zod Schemas ─┐      │
   (PARALLEL w/ 01)    │      ├──> Phase 4: Web & LinkedIn Scraping (PARALLEL w/ 03)
                       │      │
                       ├──────┼──> Phase 5: Research Agents (DEPENDS ON 01 + 02)
                       │      │
                       └──────┼──> Phase 6: Evaluation Agents (DEPENDS ON 02 + 05)
                              │
                              └──> Phase 7: Synthesis & Post-Processing (DEPENDS ON 06)
                                       │
                                       v
                              Phase 8: Pipeline Orchestrator (DEPENDS ON 03-07)
```

---

## Parallel Work Streams

Two developers can work concurrently:

| Stream | Timeline | Phases | Dependencies |
|--------|----------|--------|--------------|
| **Stream A** | Days 1-3 | Phase 1 + Phase 2 | None (fully parallel) |
| **Stream B** | Days 3-5 | Phase 3 + Phase 4 | Needs Phase 1 complete |
| **Stream C** | Days 4-7 | Phase 5 | Needs Phase 1 + Phase 2 |
| **Stream D** | Days 6-9 | Phase 6 | Needs Phase 2 + Phase 5 |
| **Stream E** | Days 8-11 | Phase 7 | Needs Phase 6 |
| **Stream F** | Days 10-13 | Phase 8 | Needs Phase 3-7 |

**Optimal Developer Allocation:**
- Developer 1: Phase 1 → Phase 3 → Phase 5 → Phase 7
- Developer 2: Phase 2 → Phase 4 → Phase 6 → Phase 8

---

## Effort Estimation

| Phase | Size | Est. Days | Parallelizable With | Critical Path |
|-------|------|-----------|---------------------|---------------|
| 01 Foundation | M | 2-3 | Phase 02 | YES |
| 02 Schemas | S | 1-2 | Phase 01 | YES |
| 03 PDF Extraction | M | 2-3 | Phase 04 | NO |
| 04 Web & LinkedIn | M | 2-3 | Phase 03 | NO |
| 05 Research Agents | L | 3-4 | -- | YES |
| 06 Evaluation Agents | L | 4-5 | -- | YES |
| 07 Synthesis & Post | M | 2-3 | -- | YES |
| 08 Orchestrator | L | 3-4 | -- | YES |
| 09 Testing Strategy | S (ref doc) | 1 | Anytime | NO |
| **TOTAL** | | **13-17 days** | *with 2 parallel devs* | |

Size Legend: S = Small (1-2 days), M = Medium (2-3 days), L = Large (3-5 days)

---

## Model Stack Summary

| Task | Model | Provider | SDK Package | Rationale |
|------|-------|----------|-------------|-----------|
| PDF OCR | `mistral-ocr-latest` | Mistral | `@mistralai/mistralai` | Best OCR accuracy for pitch decks |
| Field Extraction | `gemini-3.0-flash` | Google | `@ai-sdk/google` | Fast, cost-effective structured extraction |
| Research (4 agents) | `gemini-3.0-flash` | Google | `@ai-sdk/google` | Native Google Search integration, real-time grounding |
| Evaluation (11 agents) | `gemini-3.0-flash` | Google | `@ai-sdk/google` | Cost-efficient structured output with grounding |
| Synthesis | `gpt-5.2` | OpenAI | `@ai-sdk/openai` | Advanced reasoning for complex multi-input synthesis |
| Thesis Alignment | `gemini-3.0-flash` | Google | `@ai-sdk/google` | Fast investor thesis matching and scoring |
| Location Normalization | `gemini-3.0-flash` | Google | `@ai-sdk/google` | Simple standardization with Gemini Flash |

**Total Providers:** 2 (Google, Mistral for OCR, OpenAI only for synthesis)
**Total Models:** 2 unique LLM models across 7 task types (Gemini 3 Flash for everything except synthesis)

---

## Deliverables Summary

### New NestJS Module
- **Module:** `src/modules/ai/`
- **Files:** ~60 TypeScript files
- **BullMQ Queues:** 5 new dedicated queues
- **Agents:** 15 total (11 evaluation + 4 research)
- **Schemas:** ~20 Zod schema files
- **State Management:** Redis hash store for pipeline state

### Database Impact
- **Zero Migrations Required**
- **Target Table:** `startup_evaluations` (existing)
- All agent outputs map to existing JSONB columns

### Dependencies Added
- `ai` (Vercel AI SDK core)
- `@ai-sdk/openai`
- `@ai-sdk/google`
- `@mistralai/mistralai`
- `pdf-parse`

---

## Key Architecture Decisions

### 1. Dedicated Queues per Phase
**Decision:** Create separate queues (ai-extraction, ai-scraping, ai-research, ai-evaluation, ai-synthesis) instead of single task-queue.
**Rationale:** Granular concurrency control, better observability, independent retry strategies.

### 2. Redis Hash Store for Pipeline State
**Decision:** Use Redis hash `pipeline:{startupId}` to track intermediate results.
**Rationale:** Avoid DB writes for transient data, 24h TTL auto-cleanup, faster than Postgres JSONB queries.

### 3. Config-Driven Agent Registry
**Decision:** Centralized registry maps agent keys to prompt files, schemas, models.
**Rationale:** Easy to add/remove agents, consistent execution pattern, simplified testing.

### 4. Parallel Execution with `Promise.allSettled()`
**Decision:** All independent agents (4 research, 11 evaluation) run in parallel.
**Rationale:** 10x speedup vs sequential, graceful degradation if agents fail.

### 5. One File Per Agent
**Decision:** Each agent = separate file with prompt + schema + executor.
**Rationale:** Clear ownership, easier code review, modular testing.

### 6. Partial Results Strategy
**Decision:** Synthesis proceeds if minimum 8/11 evaluation agents succeed.
**Rationale:** Prevent full pipeline failure from single agent timeout.

---

## Complete File Structure

```
src/modules/ai/
├── ai.module.ts
├── ai.config.ts
│
├── providers/
│   └── ai-provider.service.ts
│
├── services/
│   ├── pipeline-state.service.ts
│   ├── ai-config.service.ts
│   ├── orchestrator.service.ts
│   └── storage.service.ts
│
├── interfaces/
│   ├── pipeline.interface.ts
│   ├── agent.interface.ts
│   └── research.interface.ts
│
├── schemas/
│   ├── base-evaluation.schema.ts
│   ├── extraction.schema.ts
│   ├── synthesis.schema.ts
│   ├── evaluations/
│   │   ├── team.schema.ts
│   │   ├── market.schema.ts
│   │   ├── product.schema.ts
│   │   ├── traction.schema.ts
│   │   ├── business-model.schema.ts
│   │   ├── gtm.schema.ts
│   │   ├── financials.schema.ts
│   │   ├── competitive-advantage.schema.ts
│   │   ├── legal.schema.ts
│   │   ├── deal-terms.schema.ts
│   │   └── exit-potential.schema.ts
│   ├── research/
│   │   ├── team-research.schema.ts
│   │   ├── market-research.schema.ts
│   │   ├── product-research.schema.ts
│   │   └── news-research.schema.ts
│   └── matching/
│       └── thesis-alignment.schema.ts
│
├── processors/
│   ├── extraction.processor.ts
│   ├── scraping.processor.ts
│   ├── research.processor.ts
│   ├── evaluation.processor.ts
│   └── synthesis.processor.ts
│
├── agents/
│   ├── base-agent.ts
│   ├── research/
│   │   ├── team-research.agent.ts
│   │   ├── market-research.agent.ts
│   │   ├── product-research.agent.ts
│   │   └── news-research.agent.ts
│   ├── evaluation/
│   │   ├── team-evaluation.agent.ts
│   │   ├── market-evaluation.agent.ts
│   │   ├── product-evaluation.agent.ts
│   │   ├── traction-evaluation.agent.ts
│   │   ├── business-model-evaluation.agent.ts
│   │   ├── gtm-evaluation.agent.ts
│   │   ├── financials-evaluation.agent.ts
│   │   ├── competitive-advantage-evaluation.agent.ts
│   │   ├── legal-evaluation.agent.ts
│   │   ├── deal-terms-evaluation.agent.ts
│   │   └── exit-potential-evaluation.agent.ts
│   └── synthesis/
│       ├── synthesis.agent.ts
│       └── thesis-alignment.agent.ts
│
├── prompts/
│   ├── extraction/
│   │   └── field-extraction.prompt.ts
│   ├── research/
│   │   ├── team-research.prompt.ts
│   │   ├── market-research.prompt.ts
│   │   ├── product-research.prompt.ts
│   │   └── news-research.prompt.ts
│   ├── evaluation/
│   │   ├── team.prompt.ts
│   │   ├── market.prompt.ts
│   │   ├── product.prompt.ts
│   │   ├── traction.prompt.ts
│   │   ├── business-model.prompt.ts
│   │   ├── gtm.prompt.ts
│   │   ├── financials.prompt.ts
│   │   ├── competitive-advantage.prompt.ts
│   │   ├── legal.prompt.ts
│   │   ├── deal-terms.prompt.ts
│   │   └── exit-potential.prompt.ts
│   └── synthesis/
│       ├── synthesis.prompt.ts
│       └── thesis-alignment.prompt.ts
│
├── utils/
│   ├── location-normalizer.ts
│   ├── retry.helper.ts
│   ├── token-counter.ts
│   └── pdf-parser.ts
│
└── tests/
    ├── providers/
    ├── services/
    ├── processors/
    ├── agents/
    └── schemas/
```

**Total:** ~60 files

---

## Implementation Phases

| Phase | Doc Link | Description |
|-------|----------|-------------|
| 01 | `01-foundation.md` | NestJS module, providers, Redis state, queues |
| 02 | `02-schemas.md` | All Zod schemas for agent outputs |
| 03 | `03-pdf-extraction.md` | Mistral OCR + field extraction |
| 04 | `04-web-scraping.md` | Web scraper + LinkedIn profile fetcher |
| 05 | `05-research-agents.md` | 4 research agents with Google Search |
| 06 | `06-evaluation-agents.md` | 11 evaluation agents with scoring |
| 07 | `07-synthesis.md` | Final synthesis + thesis alignment |
| 08 | `08-orchestrator.md` | BullMQ orchestrator + retry logic |
| 09 | `09-testing-strategy.md` | Integration tests + performance benchmarks |

---

## Success Metrics

### Performance Targets
- **Pipeline Duration:** <10 minutes (vs current 25-45 min)
- **Agent Concurrency:** 15 agents run in parallel phases
- **Success Rate:** >95% pipeline completion rate
- **Partial Success:** Synthesis proceeds if ≥8/11 agents succeed

### Cost Efficiency
- Use Gemini 3 Flash for all standard tasks (15-20x cheaper than GPT-4o)
- Reserve GPT-5.2 only for synthesis (complex multi-agent reasoning)
- Expected total cost: ~$0.50-1.00 per analysis (vs $8-15 with old GPT-4o stack)

### Observability
- Per-agent metrics in BullMQ dashboard
- Redis state inspection for debugging
- Pipeline duration tracking in DB
- Failed agent logging to Sentry

---

## Risk Mitigation

| Risk | Mitigation Strategy |
|------|---------------------|
| Single agent failure blocks pipeline | Use `Promise.allSettled()`, proceed with partial results |
| API rate limits | Retry with exponential backoff, queue concurrency limits |
| Large PDFs timeout | 5-minute timeout per phase, fallback to text-only parsing |
| Schema drift vs DB columns | Integration tests validate schema → DB mapping |
| Provider outages | Graceful degradation, notify user of missing evaluations |

---

## Migration Strategy

### Parallel Run Phase (Week 1-2)
- Run old + new pipelines side-by-side
- Compare outputs in `startup_evaluations` table
- Flag discrepancies for review

### Validation Phase (Week 3)
- Review 20 startup analyses manually
- Validate scores match old system ±10%
- Check for missing data fields

### Cutover (Week 4)
- Disable old pipeline
- Monitor error rates
- Keep old code for 30 days rollback window

---

## Next Steps

1. **Week 1:** Implement Phase 1 + Phase 2 (parallel)
2. **Week 2:** Implement Phase 3-4 (parallel)
3. **Week 2-3:** Implement Phase 5-6
4. **Week 3:** Implement Phase 7-8
5. **Week 4:** Integration testing + parallel run

**Primary Contacts:**
- Architecture questions → Senior Engineer
- Prompt engineering → AI Team
- Schema design → Backend Team
- Performance testing → DevOps

---

---

## TDD Workflow

**Test-Driven Development:** Every phase follows strict TDD.

**The Cycle:**
1. **Red:** Write failing tests based on acceptance criteria
2. **Green:** Write minimal code to make tests pass
3. **Refactor:** Clean up while keeping tests green

**Implementation Order:**
- For EVERY deliverable: create `.spec.ts` file FIRST
- Write test cases matching the acceptance criteria
- Run tests - they must FAIL initially
- Implement the service/agent to pass tests
- Move to next deliverable only when tests pass

**Benefits:**
- Forces interface-first thinking
- Catches edge cases early
- Prevents over-engineering
- Ensures 100% testable code with no dead code

---

## Agent Telemetry & Timing

**Performance Tracking:** Every agent call and pipeline phase is instrumented.

**Timing Implementation:**
- Use `performance.now()` or `Date.now()` for all measurements
- Timing data stored in Redis pipeline state AND new `pipeline_telemetry` structure
- All metrics persisted to `startup_evaluations.analysisProgress` JSONB column

**Per-Agent Metrics:**
- `startedAt`, `completedAt`, `durationMs`
- `tokenUsage`: `{ input, output }`
- `model` (which model was used)
- `retryCount` (number of retries)

**Per-Phase Metrics:**
- `startedAt`, `completedAt`, `durationMs`
- `agentCount`, `successCount`, `failedCount`

**Pipeline-Level Metrics:**
- `totalDurationMs`, `totalTokens`, `totalCost`
- `bottleneckPhase`, `bottleneckAgent` (slowest phase/agent)

**Use Cases:**
- Identify slow agents for optimization
- Cost tracking and optimization
- Performance regression detection
- Capacity planning

---

## Real-Time Pipeline Visualization (Low Priority)

**WebSocket Integration:** Use existing `NotificationGateway` for live pipeline updates.

**Event Types:**
- `pipeline:started` - Pipeline begins
- `phase:started` - Phase begins
- `phase:completed` - Phase finishes
- `agent:started` - Individual agent starts
- `agent:completed` - Individual agent finishes
- `pipeline:completed` - Full pipeline done

**Event Payload:**
- `startupId`, `pipelineRunId`
- `phase`, `agentKey` (if applicable)
- `status` (running/completed/failed)
- `durationMs`, `progress` (0-100)

**Frontend Visualization:**
- Live agent status: spinning (running), green (completed), red (failed), gray (pending)
- Data flow arrows between phases
- Per-agent timing and token usage in tooltips
- Progress bar for overall pipeline

**Priority:** Not blocking for MVP - can be added after core pipeline is functional.

---

**Document Version:** 1.0
**Last Updated:** 2026-02-07
**Next Review:** After Phase 1 completion
