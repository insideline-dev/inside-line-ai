# AI Agent Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current analysis/task queue flow with a production AI agent pipeline that is test-driven, observable, fault-tolerant, and scalable while writing final outputs to existing `startup_evaluations`.

**Architecture:** Build a new `backend/src/modules/ai` module with dedicated BullMQ queues per phase, Redis pipeline state, schema-first agent contracts, parallel research/evaluation execution, and orchestration with partial-failure handling. Integrate with existing startup submission/progress and notification pathways without DB migrations for `startup_evaluations`. Use an incremental cutover so existing behavior remains stable while each phase is validated.

**Tech Stack:** NestJS, BullMQ, Drizzle ORM, Redis/ioredis, Zod, AI SDK (`ai`, `@ai-sdk/google`, `@ai-sdk/openai`), `@mistralai/mistralai`, `pdf-parse`, Bun test runner

---

## Ground Rules

- Skills: `@writing-plans`
- TDD only: every capability starts with a failing test.
- No direct external API calls in tests: all provider calls mocked.
- Keep existing `analysis` module alive until Task 16 cutover.
- After each task: run targeted tests, then typecheck.

## Global Validation Commands

- Backend tests (targeted): `cd backend && bun test <path>`
- Backend tests (full): `cd backend && bun test`
- Backend typecheck: `cd backend && bunx tsc --noEmit`
- Optional lint: `cd backend && bun run lint`

## Phase-to-Code Gap Summary

- Existing today:
  - `backend/src/modules/analysis/*` with 4 processors and basic job tracking.
  - Single queue name: `task-queue` (`backend/src/queue/queue.config.ts`).
  - `backend/src/queue/processors/task.processor.ts` is still a simulated worker.
  - `startup_evaluations` already contains target JSONB columns including `analysis_progress`.
- Missing for target architecture:
  - `backend/src/modules/ai/*` (providers, schemas, agents, orchestrator, state services).
  - Dedicated queues per phase.
  - Real pipeline orchestration and phase dependencies.
  - Agent registry, telemetry, and partial-success policy (>=8/11 evaluation agents).

---

### Task 1: Bootstrap AI Module Skeleton

**Files:**
- Create: `backend/src/modules/ai/ai.module.ts`
- Create: `backend/src/modules/ai/index.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/modules/ai/tests/ai.module.spec.ts`

**Step 1: Write the failing test**

```ts
it('registers AiModule dependencies', async () => {
  const mod = await Test.createTestingModule({ imports: [AiModule] }).compile();
  expect(mod).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && bun test src/modules/ai/tests/ai.module.spec.ts`
Expected: FAIL (`AiModule` not found)

**Step 3: Write minimal implementation**

```ts
@Module({ imports: [QueueModule, DatabaseModule, NotificationModule], providers: [], exports: [] })
export class AiModule {}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && bun test src/modules/ai/tests/ai.module.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai backend/src/app.module.ts
git commit -m "feat(ai): bootstrap ai module"
```

---

### Task 2: Provider Abstraction (Gemini/OpenAI/Mistral)

**Files:**
- Create: `backend/src/modules/ai/providers/ai-provider.service.ts`
- Create: `backend/src/modules/ai/tests/providers/ai-provider.service.spec.ts`
- Modify: `backend/src/config/env.schema.ts`
- Modify: `backend/package.json`

**Step 1: Write the failing test**

```ts
it('returns configured provider clients and throws if key missing', () => {
  expect(() => service.getGemini()).not.toThrow();
  expect(() => service.getOpenAi()).not.toThrow();
  expect(() => service.getMistral()).not.toThrow();
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && bun test src/modules/ai/tests/providers/ai-provider.service.spec.ts`
Expected: FAIL (service missing)

**Step 3: Write minimal implementation**

```ts
@Injectable()
export class AiProviderService {
  getGemini() { return createGoogleGenerativeAI({ apiKey: this.env.GOOGLE_API_KEY }); }
  getOpenAi() { return createOpenAI({ apiKey: this.env.OPENAI_API_KEY }); }
  getMistral() { return new Mistral({ apiKey: this.env.MISTRAL_API_KEY }); }
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && bun test src/modules/ai/tests/providers/ai-provider.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/providers backend/src/modules/ai/tests/providers backend/src/config/env.schema.ts backend/package.json
git commit -m "feat(ai): add provider abstraction for google openai mistral"
```

---

### Task 3: Redis Pipeline State Service + Telemetry Contract

**Files:**
- Create: `backend/src/modules/ai/interfaces/pipeline.interface.ts`
- Create: `backend/src/modules/ai/services/pipeline-state.service.ts`
- Create: `backend/src/modules/ai/tests/services/pipeline-state.service.spec.ts`

**Step 1: Write the failing test**

```ts
it('initializes pipeline state and updates phase timestamps', async () => {
  await service.init(startupId, userId);
  await service.updatePhase(startupId, 'extraction', 'completed');
  const state = await service.get(startupId);
  expect(state.phases.extraction.status).toBe('completed');
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && bun test src/modules/ai/tests/services/pipeline-state.service.spec.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
const key = `pipeline:${startupId}`;
await redis.hset(key, { state: JSON.stringify(initialState) });
await redis.expire(key, 86400);
```

**Step 4: Run test to verify it passes**

Run: `cd backend && bun test src/modules/ai/tests/services/pipeline-state.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/interfaces backend/src/modules/ai/services backend/src/modules/ai/tests/services
git commit -m "feat(ai): add redis pipeline state service"
```

---

### Task 4: Dedicated AI Queue Topology

**Files:**
- Modify: `backend/src/queue/queue.config.ts`
- Modify: `backend/src/queue/queue.service.ts`
- Create: `backend/src/modules/ai/ai.config.ts`
- Test: `backend/src/queue/tests/queue.service.spec.ts`

**Step 1: Write the failing test**

```ts
it('initializes ai phase queues', () => {
  expect(QUEUE_NAMES.AI_EXTRACTION).toBe('ai-extraction');
  expect(QUEUE_NAMES.AI_SYNTHESIS).toBe('ai-synthesis');
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && bun test src/queue/tests/queue.service.spec.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
export const QUEUE_NAMES = {
  TASK: 'task-queue',
  AI_EXTRACTION: 'ai-extraction',
  AI_SCRAPING: 'ai-scraping',
  AI_RESEARCH: 'ai-research',
  AI_EVALUATION: 'ai-evaluation',
  AI_SYNTHESIS: 'ai-synthesis',
} as const;
```

**Step 4: Run test to verify it passes**

Run: `cd backend && bun test src/queue/tests/queue.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/queue backend/src/modules/ai/ai.config.ts
git commit -m "feat(queue): add dedicated ai phase queues"
```

---

### Task 5: Zod Schema System + Registry

**Files:**
- Create: `backend/src/modules/ai/schemas/**/*.ts`
- Create: `backend/src/modules/ai/schemas/registry.ts`
- Create: `backend/src/modules/ai/tests/schemas/*.spec.ts`

**Step 1: Write the failing tests**

```ts
it('rejects invalid evaluation score > 100', () => {
  expect(() => TeamEvaluationSchema.parse({ score: 130 })).toThrow();
});
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && bun test src/modules/ai/tests/schemas`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
export const BaseEvaluationSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && bun test src/modules/ai/tests/schemas`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/schemas backend/src/modules/ai/tests/schemas
git commit -m "feat(ai): implement zod schema registry for research evaluation synthesis"
```

---

### Task 6: Extraction Services (PDF Text + OCR + Field Extraction)

**Files:**
- Create: `backend/src/modules/ai/services/pdf-text-extractor.service.ts`
- Create: `backend/src/modules/ai/services/mistral-ocr.service.ts`
- Create: `backend/src/modules/ai/services/field-extractor.service.ts`
- Create: `backend/src/modules/ai/services/extraction.service.ts`
- Create: `backend/src/modules/ai/tests/services/extraction/*.spec.ts`

**Step 1: Write failing tests**

```ts
it('falls back to OCR when pdf text extraction is too short', async () => {
  const result = await extractionService.extract(startupId);
  expect(result.fields.companyName).toBeDefined();
});
```

**Step 2: Run tests to verify fail**

Run: `cd backend && bun test src/modules/ai/tests/services/extraction`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
const parsed = await this.pdfTextExtractor.extract(deckBuffer);
const rawText = parsed.text.length >= MIN_TEXT_THRESHOLD
  ? parsed.text
  : await this.ocrService.extract(deckBuffer);
return this.fieldExtractor.extract(rawText);
```

**Step 4: Run tests to verify pass**

Run: `cd backend && bun test src/modules/ai/tests/services/extraction`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/services backend/src/modules/ai/tests/services/extraction
git commit -m "feat(ai): add extraction services with ocr fallback"
```

---

### Task 7: Extraction Processor + Queue Integration

**Files:**
- Create: `backend/src/modules/ai/processors/extraction.processor.ts`
- Create: `backend/src/modules/ai/tests/processors/extraction.processor.spec.ts`
- Modify: `backend/src/modules/ai/ai.module.ts`

**Step 1: Write failing test**

```ts
it('updates pipeline state and emits websocket event on extraction complete', async () => {
  await processor.process(job);
  expect(state.updatePhase).toHaveBeenCalledWith(startupId, 'extraction', 'completed');
  expect(gateway.sendJobStatus).toHaveBeenCalled();
});
```

**Step 2: Run test to verify fail**

Run: `cd backend && bun test src/modules/ai/tests/processors/extraction.processor.spec.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
await this.pipelineState.updatePhase(startupId, 'extraction', 'running');
const result = await this.extractionService.extract(startupId);
await this.pipelineState.setResult(startupId, 'extraction', result);
await this.pipelineState.updatePhase(startupId, 'extraction', 'completed');
```

**Step 4: Run test to verify pass**

Run: `cd backend && bun test src/modules/ai/tests/processors/extraction.processor.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/processors backend/src/modules/ai/tests/processors backend/src/modules/ai/ai.module.ts
git commit -m "feat(ai): add extraction processor"
```

---

### Task 8: Scraping + LinkedIn Enrichment

**Files:**
- Create: `backend/src/modules/ai/services/website-scraper.service.ts`
- Create: `backend/src/modules/ai/services/linkedin-enrichment.service.ts`
- Create: `backend/src/modules/ai/services/scraping.service.ts`
- Create: `backend/src/modules/ai/processors/scraping.processor.ts`
- Create: `backend/src/modules/ai/tests/services/scraping/*.spec.ts`
- Create: `backend/src/modules/ai/tests/processors/scraping.processor.spec.ts`

**Step 1: Write failing tests**

```ts
it('extracts pricing, testimonials, and team members from website html', async () => {
  const data = await scraper.scrape('https://example.com');
  expect(data.teamMembers.length).toBeGreaterThan(0);
});
```

**Step 2: Run tests to verify fail**

Run: `cd backend && bun test src/modules/ai/tests/services/scraping`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
const websiteData = await this.websiteScraper.scrape(url);
const enrichedTeam = await this.linkedinEnrichment.enrichTeam(websiteData.teamMembers);
return { ...websiteData, team: enrichedTeam };
```

**Step 4: Run tests to verify pass**

Run: `cd backend && bun test src/modules/ai/tests/services/scraping src/modules/ai/tests/processors/scraping.processor.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/services backend/src/modules/ai/processors backend/src/modules/ai/tests
git commit -m "feat(ai): add web scraping and linkedin enrichment"
```

---

### Task 9: Research Agent Framework (4 agents)

**Files:**
- Create: `backend/src/modules/ai/agents/base-agent.ts`
- Create: `backend/src/modules/ai/agents/research/*.agent.ts`
- Create: `backend/src/modules/ai/prompts/research/*.prompt.ts`
- Create: `backend/src/modules/ai/services/research.service.ts`
- Create: `backend/src/modules/ai/processors/research.processor.ts`
- Create: `backend/src/modules/ai/tests/agents/research/*.spec.ts`

**Step 1: Write failing tests**

```ts
it('runs all research agents in parallel and captures grounding sources', async () => {
  const result = await researchService.run(startupId);
  expect(result.sources.length).toBeGreaterThan(0);
  expect(result.agentResults.teamResearch).toBeDefined();
});
```

**Step 2: Run tests to verify fail**

Run: `cd backend && bun test src/modules/ai/tests/agents/research`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
const settled = await Promise.allSettled([
  this.teamAgent.run(ctx),
  this.marketAgent.run(ctx),
  this.productAgent.run(ctx),
  this.newsAgent.run(ctx),
]);
```

**Step 4: Run tests to verify pass**

Run: `cd backend && bun test src/modules/ai/tests/agents/research`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/agents backend/src/modules/ai/prompts/research backend/src/modules/ai/services/research.service.ts backend/src/modules/ai/processors/research.processor.ts backend/src/modules/ai/tests/agents/research
git commit -m "feat(ai): implement parallel research agents with grounding"
```

---

### Task 10: Evaluation Agent Framework (11 agents)

**Files:**
- Create: `backend/src/modules/ai/agents/evaluation/*.agent.ts`
- Create: `backend/src/modules/ai/prompts/evaluation/*.prompt.ts`
- Create: `backend/src/modules/ai/services/evaluation.service.ts`
- Create: `backend/src/modules/ai/processors/evaluation.processor.ts`
- Create: `backend/src/modules/ai/tests/agents/evaluation/*.spec.ts`

**Step 1: Write failing tests**

```ts
it('continues when up to 3 agents fail and enforces minimum 8 successful results', async () => {
  await expect(evaluationService.run(startupId)).resolves.toMatchObject({ successCount: 8 });
});
```

**Step 2: Run tests to verify fail**

Run: `cd backend && bun test src/modules/ai/tests/agents/evaluation`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
const settled = await Promise.allSettled(agentRuns);
const successCount = settled.filter((x) => x.status === 'fulfilled').length;
if (successCount < 8) throw new Error('Insufficient evaluation coverage');
```

**Step 4: Run tests to verify pass**

Run: `cd backend && bun test src/modules/ai/tests/agents/evaluation`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/agents/evaluation backend/src/modules/ai/prompts/evaluation backend/src/modules/ai/services/evaluation.service.ts backend/src/modules/ai/processors/evaluation.processor.ts backend/src/modules/ai/tests/agents/evaluation
git commit -m "feat(ai): implement 11 evaluation agents with partial success policy"
```

---

### Task 11: Synthesis + Post-Processing + DB Mapping

**Files:**
- Create: `backend/src/modules/ai/agents/synthesis/synthesis.agent.ts`
- Create: `backend/src/modules/ai/agents/synthesis/thesis-alignment.agent.ts`
- Create: `backend/src/modules/ai/services/score-computation.service.ts`
- Create: `backend/src/modules/ai/services/synthesis.service.ts`
- Create: `backend/src/modules/ai/processors/synthesis.processor.ts`
- Create: `backend/src/modules/ai/tests/services/synthesis/*.spec.ts`

**Step 1: Write failing tests**

```ts
it('maps synthesis output into startup_evaluations columns and computes overall score deterministically', async () => {
  const out = await synthesisService.run(startupId);
  expect(out.overallScore).toBeGreaterThanOrEqual(0);
  expect(out.overallScore).toBeLessThanOrEqual(100);
});
```

**Step 2: Run tests to verify fail**

Run: `cd backend && bun test src/modules/ai/tests/services/synthesis`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
await this.db.insert(startupEvaluation)
  .values({ startupId, teamData, marketData, sectionScores, overallScore, analysisProgress })
  .onConflictDoUpdate({ target: startupEvaluation.startupId, set: mappedFields });
```

**Step 4: Run tests to verify pass**

Run: `cd backend && bun test src/modules/ai/tests/services/synthesis`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/agents/synthesis backend/src/modules/ai/services backend/src/modules/ai/processors/synthesis.processor.ts backend/src/modules/ai/tests/services/synthesis
git commit -m "feat(ai): implement synthesis and evaluation persistence"
```

---

### Task 12: Pipeline Orchestrator

**Files:**
- Create: `backend/src/modules/ai/orchestrator/pipeline.service.ts`
- Create: `backend/src/modules/ai/orchestrator/progress-tracker.service.ts`
- Create: `backend/src/modules/ai/orchestrator/error-recovery.service.ts`
- Create: `backend/src/modules/ai/orchestrator/phase-transition.service.ts`
- Create: `backend/src/modules/ai/tests/orchestrator/*.spec.ts`

**Step 1: Write failing tests**

```ts
it('runs extraction and scraping in parallel then triggers research->evaluation->synthesis', async () => {
  const runId = await pipeline.startPipeline(startupId, userId);
  expect(runId).toBeDefined();
  expect(queue.addJob).toHaveBeenCalledWith('ai-extraction', expect.anything(), expect.anything());
  expect(queue.addJob).toHaveBeenCalledWith('ai-scraping', expect.anything(), expect.anything());
});
```

**Step 2: Run tests to verify fail**

Run: `cd backend && bun test src/modules/ai/tests/orchestrator`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
await Promise.all([
  this.queue.addJob(QUEUE_NAMES.AI_EXTRACTION, payload),
  this.queue.addJob(QUEUE_NAMES.AI_SCRAPING, payload),
]);
```

**Step 4: Run tests to verify pass**

Run: `cd backend && bun test src/modules/ai/tests/orchestrator`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/orchestrator backend/src/modules/ai/tests/orchestrator
git commit -m "feat(ai): add pipeline orchestrator with phase transitions"
```

---

### Task 13: API + Startup Integration + Progress Endpoint

**Files:**
- Create: `backend/src/modules/ai/ai.controller.ts`
- Modify: `backend/src/modules/startup/startup.service.ts`
- Modify: `backend/src/modules/startup/startup.controller.ts`
- Modify: `backend/src/modules/startup/dto/get-progress.dto.ts`
- Test: `backend/src/modules/startup/tests/startup.service.spec.ts`
- Test: `backend/src/modules/startup/tests/startup.controller.spec.ts`

**Step 1: Write failing tests**

```ts
it('submit() starts ai pipeline and getProgress returns pipeline phases', async () => {
  await service.submit(startupId, userId);
  expect(aiPipeline.startPipeline).toHaveBeenCalledWith(startupId, userId);
});
```

**Step 2: Run tests to verify fail**

Run: `cd backend && bun test src/modules/startup/tests/startup.service.spec.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
await this.aiPipelineService.startPipeline(id, userId);
return this.aiPipelineService.getPipelineStatus(id);
```

**Step 4: Run tests to verify pass**

Run: `cd backend && bun test src/modules/startup/tests/startup.service.spec.ts src/modules/startup/tests/startup.controller.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/ai.controller.ts backend/src/modules/startup
git commit -m "feat(ai): integrate pipeline with startup submit and progress"
```

---

### Task 14: Telemetry, Cost Tracking, and WebSocket Event Model

**Files:**
- Modify: `backend/src/modules/ai/interfaces/pipeline.interface.ts`
- Modify: `backend/src/modules/ai/services/pipeline-state.service.ts`
- Modify: `backend/src/notification/notification.gateway.ts`
- Create: `backend/src/modules/ai/tests/services/telemetry.spec.ts`

**Step 1: Write failing tests**

```ts
it('records per-agent timing and token usage and emits phase+agent events', async () => {
  await telemetry.recordAgent(startupId, 'team-evaluation', metrics);
  expect(gateway.sendJobStatus).toHaveBeenCalled();
});
```

**Step 2: Run tests to verify fail**

Run: `cd backend && bun test src/modules/ai/tests/services/telemetry.spec.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
state.telemetry.agents[agentKey] = { startedAt, completedAt, durationMs, tokenUsage, model, retryCount };
await this.persistAnalysisProgress(startupId, state);
```

**Step 4: Run tests to verify pass**

Run: `cd backend && bun test src/modules/ai/tests/services/telemetry.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/interfaces backend/src/modules/ai/services backend/src/notification/notification.gateway.ts backend/src/modules/ai/tests/services/telemetry.spec.ts
git commit -m "feat(ai): add telemetry and websocket progress events"
```

---

### Task 15: Full Integration and Performance Guardrails

**Files:**
- Create: `backend/src/modules/ai/tests/integration/pipeline.integration.spec.ts`
- Create: `backend/src/modules/ai/tests/integration/pipeline.failure.spec.ts`
- Create: `backend/src/modules/ai/tests/fixtures/*.json`

**Step 1: Write failing tests**

```ts
it('completes happy-path pipeline end-to-end with mocked providers', async () => {
  const res = await pipeline.startPipeline(startupId, userId);
  expect(res).toBeDefined();
});
```

**Step 2: Run tests to verify fail**

Run: `cd backend && bun test src/modules/ai/tests/integration`
Expected: FAIL

**Step 3: Write minimal implementation and fixture wiring**

```ts
mockProviderResponses();
await runPipelineUntilTerminalState(startupId);
expect(progress.status).toBe('completed');
```

**Step 4: Run tests + full typecheck**

Run:
- `cd backend && bun test src/modules/ai/tests/integration`
- `cd backend && bunx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/tests/integration backend/src/modules/ai/tests/fixtures
git commit -m "test(ai): add integration and failure-path coverage"
```

---

### Task 16: Controlled Cutover from Legacy Analysis Flow

**Files:**
- Modify: `backend/src/modules/startup/startup.service.ts`
- Modify: `backend/src/queue/processors/task.processor.ts`
- Modify: `backend/src/modules/analysis/analysis.module.ts`
- Modify: `backend/src/modules/analysis/analysis.service.ts`
- Create: `backend/src/modules/analysis/tests/cutover-compat.spec.ts`

**Step 1: Write failing test**

```ts
it('routes startup analysis requests to ai pipeline and keeps legacy endpoints backward-compatible', async () => {
  await startupService.reanalyze(startupId, adminId);
  expect(aiPipeline.startPipeline).toHaveBeenCalled();
});
```

**Step 2: Run test to verify fail**

Run: `cd backend && bun test src/modules/analysis/tests/cutover-compat.spec.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
if (featureFlags.aiPipelineEnabled) {
  return this.aiPipelineService.startPipeline(startupId, userId);
}
return this.analysisService.queueScoringJob(startupId, userId);
```

**Step 4: Run regression test pack**

Run:
- `cd backend && bun test`
- `cd backend && bunx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/startup backend/src/queue/processors/task.processor.ts backend/src/modules/analysis
git commit -m "refactor(ai): cut over to ai pipeline with compatibility guard"
```

---

## Execution Order and Parallelization

- Stream A: Tasks 1,2,3,4,6,7,9,11,14,15
- Stream B: Tasks 5,8,10,12,13,16
- Merge gates:
  - Gate A (after Task 4 + 5): schema and queue contracts frozen.
  - Gate B (after Task 10 + 11): evaluation+synthesis DB mapping validated.
  - Gate C (after Task 15): integration tests green before cutover.

## Definition of Done

- `backend/src/modules/ai` implemented and wired in app module.
- Dedicated AI queues in production config.
- 4 research + 11 evaluation + synthesis agents operational with schema validation.
- Pipeline orchestration supports retries, partial success, and status retrieval.
- `startup_evaluations` populated correctly without migrations for main columns.
- Real-time progress events emitted.
- `bun test` and `bunx tsc --noEmit` pass in `backend/`.

## Open Decisions to Resolve Before Task 10

- Resolve model naming mismatch in docs (`06-evaluation.md` references GPT-4o; overview targets Gemini 3 Flash for evaluation).
- Confirm if new table(s) from `08-orchestration.md` are required now (`pipeline_runs`) or deferred to post-MVP.
- Confirm telemetry persistence strategy: Redis-only + `analysis_progress`, or add durable analytics storage.

