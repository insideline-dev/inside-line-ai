# Phase 8: Pipeline Orchestrator

## Goal
Build the top-level orchestrator managing the entire AI pipeline from extraction through synthesis. Handle phase transitions with dependency resolution, manage partial failures gracefully, provide real-time progress tracking via WebSocket, and enable pipeline retry/cancellation.

## Prerequisites
- Phase 3 (Extraction) complete and tested
- Phase 4 (Scraping) complete and tested
- Phase 5 (Research) complete and tested
- Phase 6 (Evaluation) complete and tested
- Phase 7 (Synthesis) complete and tested
- NotificationGateway WebSocket infrastructure functional
- Redis infrastructure available for state management

## Deliverables

| File | Purpose |
|------|---------|
| `src/modules/ai/orchestrator/orchestrator.module.ts` | NestJS sub-module importing all phase modules (extraction, scraping, research, evaluation, synthesis) and orchestration services |
| `src/modules/ai/orchestrator/pipeline.config.ts` | Configuration-driven pipeline definition: phases array with names, dependencies, parallel groups, timeout per phase, retry policy per phase. No hardcoded logic |
| `src/modules/ai/orchestrator/pipeline.service.ts` | Main orchestrator with methods: `startPipeline(startupId, userId)` returns pipelineRunId, `getPipelineStatus(startupId)` returns current progress, `retryPhase(startupId, phase)` re-queues failed phase, `cancelPipeline(startupId)` removes pending jobs and marks cancelled |
| `src/modules/ai/orchestrator/progress-tracker.service.ts` | Updates `analysisProgress` JSONB column in `startup_evaluations` table (same structure as old backend). Emits WebSocket events via `NotificationGateway` at both phase-level and agent-level granularity. Methods: `initProgress()`, `updatePhaseProgress()`, `updateAgentProgress()`, `getProgress()` |
| `src/modules/ai/orchestrator/phase-transition.service.ts` | Listens for BullMQ job completion events across all queues. Checks prerequisite completion for next phase. Queues subsequent phases when dependencies satisfied. Handles partial failure scenarios - if extraction fails but scraping succeeds, research still runs with available data |
| `src/modules/ai/orchestrator/error-recovery.service.ts` | Phase timeout detection using BullMQ delayed jobs, partial failure strategy (mark failed components, continue with degraded data), pipeline retry (re-queue only failed phases, reuse cached Redis results), dead letter queue handling with admin notifications |

## Files to Modify

| File | Change Required |
|------|-----------------|
| `src/modules/ai/ai.module.ts` | Import `OrchestratorModule`, add to imports array |
| `src/modules/startup/startup.service.ts` or `src/modules/analysis/analysis.service.ts` | Replace stub market analysis + rule-based scoring with call to `PipelineService.startPipeline()`. Trigger point: when startup status changes to 'submitted' |

## Key Interface Names

### Configuration Interfaces
- `PipelineConfig`: contains `phases: PhaseConfig[]`, `maxPipelineTimeout: number`, `defaultRetryPolicy: RetryPolicy`
- `PhaseConfig`: fields include `phase: PhaseName`, `dependsOn: PhaseName[]`, `canRunParallelWith: PhaseName[]`, `timeout: number`, `maxRetries: number`, `required: boolean`, `queue: string`
- `RetryPolicy`: `maxRetries: number`, `backoff: 'exponential' | 'linear' | 'fixed'`, `initialDelay: number`

### Progress Tracking Interfaces
- `PipelineProgress`: `pipelineRunId: string`, `startupId: number`, `currentPhase: PhaseName`, `phases: PhaseProgress[]`, `overallProgress: number` (0-100), `startedAt: Date`, `estimatedCompletionAt?: Date`, `status: 'running' | 'completed' | 'failed' | 'cancelled'`
- `PhaseProgress`: `phase: PhaseName`, `status: PhaseStatus`, `agents: AgentStatus[]`, `startedAt?: Date`, `completedAt?: Date`, `error?: ErrorDetail`
- `AgentStatus`: `key: string`, `status: 'pending' | 'running' | 'completed' | 'failed'`, `startedAt?: Date`, `completedAt?: Date`, `progress?: number`, `error?: ErrorDetail`
- `PhaseStatus`: `'pending' | 'waiting' | 'running' | 'completed' | 'failed' | 'skipped'`

### State Management
- `PipelineState`: stored in Redis with key `pipeline:state:{startupId}`. Contains current phase, completed phases set, failed phases set, cached results per phase, started timestamp
- `PhaseResult`: generic result wrapper with `success: boolean`, `data?: any`, `error?: ErrorDetail`, `cached: boolean`

## Phase Transition Flow (Detailed)

### Pipeline Initialization
1. User triggers pipeline via startup submission or manual retry
2. `PipelineService.startPipeline()` called with startupId and userId
3. Generate unique `pipelineRunId` (UUID)
4. Initialize Redis state: `pipeline:state:{startupId}` with empty sets
5. Create database record in `pipeline_runs` table (new table for audit trail)
6. Call `ProgressTrackerService.initProgress()` to create `analysisProgress` JSONB structure
7. Update startup status: `submitted` → `analyzing`
8. Queue extraction and scraping jobs simultaneously (both have empty `dependsOn`)
9. Emit WebSocket event: `pipeline:started` with pipelineRunId

### Parallel Phase Execution (Extraction + Scraping)
1. Both extraction and scraping start immediately (no dependencies)
2. `PhaseTransitionService` subscribes to completion events from both queues
3. Each phase independently updates progress via `ProgressTrackerService`
4. Each phase independently caches results in Redis: `pipeline:result:{startupId}:{phase}`
5. WebSocket events emitted: `phase:started`, `agent:progress`, `agent:completed` per agent

### Research Phase Trigger
1. `PhaseTransitionService` receives completion event from extraction queue
2. Checks if scraping also completed: query Redis state `pipeline:state:{startupId}`
3. If scraping NOT complete: log "extraction done, waiting for scraping" and return
4. `PhaseTransitionService` receives completion event from scraping queue
5. Checks if extraction also completed: query Redis state
6. Both complete → queue research job with payload containing startupId
7. Research processor fetches cached extraction + scraping results from Redis
8. WebSocket event: `phase:started` for research

### Evaluation Phase Trigger
1. `PhaseTransitionService` receives completion event from research queue
2. No other dependencies to check (research is single prerequisite)
3. Queue evaluation job immediately
4. Evaluation processor fetches cached extraction, scraping, research from Redis
5. All 11 evaluation agents run (internal parallelization within evaluation phase)

### Synthesis Phase Trigger
1. `PhaseTransitionService` receives completion event from evaluation queue
2. Check if minimum 8/11 agents succeeded (configurable threshold)
3. If threshold met: queue synthesis job
4. If threshold NOT met: mark pipeline as degraded but still queue synthesis
5. Synthesis processor fetches all cached results from Redis

### Pipeline Completion
1. `PhaseTransitionService` receives completion event from synthesis queue
2. Update pipeline status to `completed`
3. Update startup status: `analyzing` → `pending_review`
4. Set Redis TTL on all cached results: 1 hour (for debugging/retry)
5. Emit WebSocket event: `pipeline:completed` with final overallScore
6. Trigger investor notification workflow if matches found

## Error Handling Strategy

### Single Agent Failure
- **Scenario**: One evaluation agent (e.g., market analysis) fails after retries
- **Strategy**: Mark agent as failed in progress tracking. Continue pipeline with 10/11 results. Log warning. Synthesis notes missing data in `dataConfidenceNotes`
- **Example**: Team evaluation fails → synthesis still runs, marks team score as N/A

### Phase Failure (All Retries Exhausted)
- **Scenario**: Research phase fails after 3 retries
- **Strategy**: Mark phase as failed. Check `PhaseConfig.required` flag. If required=false, check if next phase (`dependsOn`) can proceed without it. If yes, queue next phase with degraded data flag. If required=true, halt pipeline
- **Example**: Research fails (required=false) → evaluation still runs using only extraction + scraping data

### Extraction Failure, Scraping Success
- **Scenario**: PDF extraction fails (corrupted file, timeout), but scraping succeeds
- **Strategy**: Cache scraping results. Mark extraction as failed. When both complete, queue research with `extractionData: null`, `scrapingData: <results>`. Research prompts adapt to missing extraction
- **WebSocket**: Emit `phase:failed` for extraction, `phase:completed` for scraping

### Evaluation Degraded Success
- **Scenario**: Only 7/11 evaluation agents succeed (below 8/11 threshold)
- **Strategy**: Mark evaluation phase as `degraded` rather than `completed`. Still queue synthesis. Synthesis prompt acknowledges missing evaluations. `dataConfidenceNotes` lists failed agents
- **Database**: `pipelineQuality` field in `startup_evaluations` set to `'degraded'`

### Full Pipeline Failure
- **Scenario**: Synthesis phase fails after retries OR multiple required phases fail
- **Strategy**: Move job to dead letter queue. Update startup status to `failed`. Send admin notification via NotificationGateway. Generate detailed error report including: failed phases, retry attempts, error messages, partial results available
- **Retry**: Admin can manually trigger `retryPhase()` or full pipeline retry

### Timeout Detection
- **Mechanism**: Each phase config specifies timeout. `ErrorRecoveryService` schedules delayed job at phase start. If phase doesn't complete before timeout, delayed job triggers and marks phase as timed out
- **Example**: Research phase timeout=600s. At 600s, if still running, mark failed and trigger error recovery

### Partial Failure Recovery Strategy Table

| Failed Phase | Can Research Run? | Can Evaluation Run? | Can Synthesis Run? | Data Quality Impact |
|--------------|-------------------|---------------------|-------------------|---------------------|
| Extraction | Yes (scraping data only) | Yes (degraded) | Yes (degraded) | Medium |
| Scraping | Yes (extraction data only) | Yes (degraded) | Yes (degraded) | Low-Medium |
| Research | Configurable (default: Yes) | Yes (no research context) | Yes (degraded) | Medium-High |
| Evaluation (partial <8/11) | N/A | N/A | Yes (degraded) | High |
| Evaluation (total fail) | N/A | N/A | No | Pipeline fails |
| Synthesis | N/A | N/A | N/A | Pipeline fails |

## Component Responsibilities

### PipelineService
Main entry point for all pipeline operations. Validates startup exists and is in correct status before starting. Generates audit trail in `pipeline_runs` table with userId, timestamps, configuration snapshot. Implements `cancelPipeline()` by removing pending jobs from all queues and updating state. Implements `retryPhase()` by clearing phase-specific Redis cache and re-queuing job. Provides `getPipelineStatus()` aggregating Redis state + database progress JSONB.

### ProgressTrackerService
Manages `analysisProgress` JSONB structure matching old backend format:
```
{
  phases: {
    extraction: { status, agents: {...}, startedAt, completedAt },
    scraping: { status, agents: {...}, startedAt, completedAt },
    research: { status, agents: {...}, startedAt, completedAt },
    evaluation: { status, agents: {...}, startedAt, completedAt },
    synthesis: { status, completedAt }
  },
  overallProgress: 67,
  currentPhase: 'evaluation',
  estimatedTimeRemaining: 180
}
```
Updates via Drizzle atomic operations. Emits WebSocket events with room targeting (startup-specific room). Calculates `estimatedTimeRemaining` based on average phase durations.

### PhaseTransitionService
Subscribes to BullMQ `QueueEvents` for all pipeline queues. On `completed` event, reads Redis state to check dependencies. Uses `PipelineConfig` to determine next phases. Handles race conditions when parallel phases complete simultaneously (uses Redis WATCH/MULTI/EXEC for atomic state updates). Logs detailed transition events for debugging. Handles `failed` events by triggering error recovery.

### ErrorRecoveryService
Implements timeout detection via scheduled delayed jobs in separate `pipeline-timeout` queue. On timeout, cancels in-progress job and marks failed. Implements exponential backoff retry: 1st retry immediate, 2nd retry +30s, 3rd retry +60s. Handles dead letter queue by persisting failed job data to `pipeline_failures` table. Sends Slack/email notifications to admins for critical failures. Provides `getDiagnostics(startupId)` method returning full error context.

## Acceptance Criteria

### Pipeline Execution
- [ ] `startPipeline()` returns valid `pipelineRunId` and begins processing within 1 second
- [ ] Extraction and scraping start simultaneously (both queued within 100ms)
- [ ] Research does NOT start until both extraction AND scraping complete (or fail)
- [ ] Evaluation does NOT start until research completes
- [ ] Synthesis does NOT start until evaluation completes
- [ ] Pipeline completion updates startup status to `pending_review`
- [ ] Redis state cleaned up 1 hour after completion

### Progress Tracking
- [ ] WebSocket emits at: pipeline start, each phase start/complete/fail, each agent start/progress/complete
- [ ] `analysisProgress` JSONB updated at every transition with <100ms latency
- [ ] `overallProgress` percentage accurately reflects completion (0-100)
- [ ] `estimatedTimeRemaining` within 20% accuracy after first phase completes
- [ ] Progress visible in real-time to frontend via WebSocket subscription

### Error Handling
- [ ] `retryPhase()` re-queues only specified failed phase, reuses cached results from prior phases
- [ ] `cancelPipeline()` removes all pending jobs and marks pipeline cancelled within 2 seconds
- [ ] Startup status transitions to `failed` only when critical required phase fails
- [ ] Single agent failure does not halt pipeline
- [ ] Extraction failure + scraping success → research runs with degraded data
- [ ] Partial evaluation success (7/11) → synthesis runs with degraded flag

### Failure Scenarios
- [ ] Total evaluation failure (0/11) → pipeline marked failed, admin notified
- [ ] Synthesis failure after retries → dead letter queue, detailed error report
- [ ] Phase timeout → marked failed, recovery triggered
- [ ] Concurrent pipeline requests for same startup → second request rejected with error

### State Management
- [ ] Redis state persists across service restarts (1 hour TTL)
- [ ] Phase results cached correctly and retrievable by subsequent phases
- [ ] Pipeline state recovery possible after service crash (resume from last completed phase)

## Test Plan

| Test File | Focus | Mock Strategy |
|-----------|-------|---------------|
| `pipeline.service.spec.ts` | Orchestration logic | Mock `QueueService` (verify correct jobs queued with correct payloads). Mock `PipelineState` Redis operations. Test: happy path (all phases succeed), partial failure (extraction fails), total failure (synthesis fails), concurrent start attempts |
| `progress-tracker.service.spec.ts` | Progress updates and WebSocket | Mock Drizzle for JSONB updates + `NotificationGateway` for WebSocket. Verify: DB writes with correct structure, WebSocket events with correct room targeting, progress percentage calculation, estimated time calculation |
| `phase-transition.service.spec.ts` | Dependency resolution | Mock BullMQ `QueueEvents`. Simulate completion events in various orders. Verify: extraction completes before scraping → research NOT queued yet. Scraping then completes → research queued. Race condition handling (both complete simultaneously) |
| `error-recovery.service.spec.ts` | Retry and timeout logic | Mock BullMQ job cancellation + delayed jobs. Test: timeout detection triggers recovery, exponential backoff retry delays, dead letter handling, admin notification triggering |
| `pipeline.config.spec.ts` | Configuration validation | No mocks (pure validation). Test: circular dependency detection, invalid phase names, negative timeouts, missing required fields |

### Integration Test Scenarios
Create `pipeline.integration.spec.ts` for end-to-end pipeline testing:
- **Scenario 1**: Happy path - all phases succeed, final score computed
- **Scenario 2**: Extraction fails, scraping succeeds, pipeline completes with degraded flag
- **Scenario 3**: 3 evaluation agents fail, pipeline completes with warning
- **Scenario 4**: Research times out after 600s, marked failed, evaluation skipped
- **Scenario 5**: Cancel pipeline mid-research, verify all queues cleared

Use in-memory BullMQ + Redis for integration tests. Mock only external APIs (AI SDK, Mistral SDK).

## Reference Files

### Existing Patterns
- `src/modules/analysis/analysis.service.ts` - current analysis triggering logic
- `src/modules/analysis/processors/*.processor.ts` - BullMQ processor patterns
- `src/notification/notification.gateway.ts` - WebSocket event emission patterns

### State Management
- Existing Redis usage patterns in codebase
- `startup_evaluations` table schema for `analysisProgress` JSONB

### Configuration
- Existing queue configuration in `src/modules/queue/queue.module.ts`

## Database Schema Changes

### New Tables Required

**`pipeline_runs`** (audit trail)
- `id`: primary key
- `pipelineRunId`: UUID unique
- `startupId`: foreign key
- `userId`: foreign key (who triggered)
- `status`: enum (running, completed, failed, cancelled)
- `config`: JSONB (snapshot of PipelineConfig used)
- `startedAt`: timestamp
- `completedAt`: timestamp nullable
- `error`: JSONB nullable

**`pipeline_failures`** (dead letter persistence)
- `id`: primary key
- `pipelineRunId`: foreign key
- `phase`: enum
- `jobData`: JSONB
- `error`: JSONB
- `attemptedAt`: timestamp
- `retryCount`: integer

### Migrations
Create migration files:
- `0XXX_create_pipeline_runs.ts`
- `0XXX_create_pipeline_failures.ts`

## Effort Estimate
**Size: L (3-4 days)**

### Breakdown
- Pipeline configuration structure: 0.25 day
- `PipelineService` core orchestration: 0.75 day
- `PhaseTransitionService` dependency resolution: 1 day (complex race conditions)
- `ProgressTrackerService` + WebSocket integration: 0.5 day
- `ErrorRecoveryService` timeout + retry: 0.5 day
- Database migrations + schema: 0.25 day
- Integration testing: 0.75 day
- Documentation + acceptance testing: 0.25 day

### Dependencies
- All Phase 3-7 modules complete and tested
- NotificationGateway functional
- Redis infrastructure available
- BullMQ queues configured

### Risk Factors
- **Race conditions**: Parallel phase completion requires careful Redis atomic operations
- **State consistency**: Service crashes mid-pipeline require robust recovery
- **WebSocket scaling**: High-frequency progress updates may overwhelm connections - mitigate with event throttling
- **Timeout accuracy**: BullMQ delayed jobs timing precision varies under load - test thoroughly
