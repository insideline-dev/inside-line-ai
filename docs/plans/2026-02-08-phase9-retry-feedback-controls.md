# Phase 9 Retry + Feedback Control Plane Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement production-safe phase retry, agent retry, and feedback-guided re-runs so admins can correct failed/weak AI outcomes without full blind reanalysis.

**Architecture:** Add a thin control plane on top of the existing DAG pipeline: API contracts in `admin`, orchestration methods in `ai`, and immutable feedback persistence. Keep execution async via existing BullMQ processors and pipeline state; for agent retry, run only the targeted agent then trigger only required downstream phases.

**Tech Stack:** NestJS, Drizzle ORM, BullMQ, Redis pipeline state, Zod DTOs (`nestjs-zod`), TanStack Query + Orval generated hooks.

---

### Task 1: Add Admin API Contracts for Retry + Feedback

**Files:**
- Create: `backend/src/modules/admin/dto/retry-phase.dto.ts`
- Create: `backend/src/modules/admin/dto/retry-agent.dto.ts`
- Modify: `backend/src/modules/admin/dto/index.ts`
- Modify: `backend/src/modules/admin/admin.controller.ts`
- Test: `backend/src/modules/admin/tests/admin.controller.spec.ts`

**Step 1: Write the failing tests**

```ts
it('POST /admin/startups/:id/retry-phase calls startupService.adminRetryPhase', async () => {
  const dto = { phase: 'evaluation', forceRerun: false, feedback: 'Focus on unit economics assumptions' };
  await controller.retryStartupPhase(adminUser, startupId, dto as any);
  expect(startupService.adminRetryPhase).toHaveBeenCalledWith(startupId, adminUser.id, dto);
});

it('POST /admin/startups/:id/retry-agent calls startupService.adminRetryAgent', async () => {
  const dto = { phase: 'evaluation', agent: 'market', feedback: 'Use updated TAM source assumptions' };
  await controller.retryStartupAgent(adminUser, startupId, dto as any);
  expect(startupService.adminRetryAgent).toHaveBeenCalledWith(startupId, adminUser.id, dto);
});
```

**Step 2: Run test to verify failure**

Run: `cd backend && bun test src/modules/admin/tests/admin.controller.spec.ts -t "retry"`
Expected: FAIL with missing methods/routes/DTOs.

**Step 3: Write minimal implementation**

```ts
// retry-phase.dto.ts
export const RetryPhaseSchema = z.object({
  phase: z.nativeEnum(PipelinePhase),
  forceRerun: z.boolean().default(false),
  feedback: z.string().trim().min(10).max(3000).optional(),
});

// retry-agent.dto.ts
export const RetryAgentSchema = z.object({
  phase: z.enum([PipelinePhase.RESEARCH, PipelinePhase.EVALUATION]),
  agent: z.string().min(1),
  feedback: z.string().trim().min(10).max(3000).optional(),
});
```

**Step 4: Run tests to verify pass**

Run: `cd backend && bun test src/modules/admin/tests/admin.controller.spec.ts -t "retry"`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/src/modules/admin/dto/retry-phase.dto.ts backend/src/modules/admin/dto/retry-agent.dto.ts backend/src/modules/admin/dto/index.ts backend/src/modules/admin/admin.controller.ts backend/src/modules/admin/tests/admin.controller.spec.ts
git commit -m "feat(admin): add retry phase/agent API contracts"
```

### Task 2: Persist Feedback as First-Class Data

**Files:**
- Create: `backend/src/modules/ai/entities/pipeline-feedback.schema.ts`
- Create: `backend/src/modules/ai/services/pipeline-feedback.service.ts`
- Create: `backend/src/modules/ai/tests/services/pipeline-feedback.service.spec.ts`
- Modify: `backend/src/modules/ai/entities/index.ts`
- Modify: `backend/src/modules/ai/ai.module.ts`
- Create: `backend/src/database/migrations/2026-02-08-pipeline-feedback.sql`

**Step 1: Write failing service tests**

```ts
it('stores feedback entries and returns latest unresolved by scope', async () => {
  await service.record({ startupId, phase: 'evaluation', agent: 'market', feedback: 'Re-check TAM assumptions', createdBy: adminId });
  const latest = await service.getContext(startupId, 'evaluation', 'market');
  expect(latest.items).toHaveLength(1);
});

it('marks feedback consumed after successful application', async () => {
  const entry = await service.record(...);
  await service.markConsumed([entry.id]);
  const latest = await service.getContext(startupId, 'evaluation', 'market');
  expect(latest.items).toHaveLength(0);
});
```

**Step 2: Run test to verify failure**

Run: `cd backend && bun test src/modules/ai/tests/services/pipeline-feedback.service.spec.ts`
Expected: FAIL with missing schema/service.

**Step 3: Write minimal implementation**

```ts
export const pipelineFeedback = pgTable('pipeline_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  startupId: uuid('startup_id').notNull().references(() => startup.id, { onDelete: 'cascade' }),
  phase: pipelinePhaseEnum('phase').notNull(),
  agentKey: text('agent_key'),
  feedback: text('feedback').notNull(),
  createdBy: uuid('created_by').notNull().references(() => user.id),
  consumedAt: timestamp('consumed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Step 4: Run tests to verify pass**

Run: `cd backend && bun test src/modules/ai/tests/services/pipeline-feedback.service.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/src/modules/ai/entities/pipeline-feedback.schema.ts backend/src/modules/ai/services/pipeline-feedback.service.ts backend/src/modules/ai/tests/services/pipeline-feedback.service.spec.ts backend/src/modules/ai/entities/index.ts backend/src/modules/ai/ai.module.ts backend/src/database/migrations/2026-02-08-pipeline-feedback.sql
git commit -m "feat(ai): persist pipeline feedback entries"
```

### Task 3: Implement Phase Retry and Force Rerun Semantics

**Files:**
- Modify: `backend/src/modules/ai/services/pipeline.service.ts`
- Modify: `backend/src/modules/ai/services/pipeline-state.service.ts`
- Modify: `backend/src/modules/startup/startup.service.ts`
- Modify: `backend/src/modules/startup/tests/startup.service.spec.ts`
- Test: `backend/src/modules/ai/tests/services/pipeline.service.spec.ts`

**Step 1: Write failing tests**

```ts
it('rerunFromPhase resets selected + downstream phases and requeues selected phase', async () => {
  await service.rerunFromPhase('startup-1', PipelinePhase.RESEARCH, 'admin-1');
  expect(pipelineState.clearPhaseResult).toHaveBeenCalledWith('startup-1', PipelinePhase.RESEARCH);
  expect(pipelineState.clearPhaseResult).toHaveBeenCalledWith('startup-1', PipelinePhase.EVALUATION);
  expect(pipelineState.clearPhaseResult).toHaveBeenCalledWith('startup-1', PipelinePhase.SYNTHESIS);
});
```

**Step 2: Run tests to confirm red**

Run: `cd backend && bun test src/modules/ai/tests/services/pipeline.service.spec.ts -t "rerunFromPhase"`
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
async rerunFromPhase(startupId: string, phase: PipelinePhase, userId: string): Promise<void> {
  const cfg = this.phaseTransition.getConfig().phases.map(p => p.phase);
  const startIndex = cfg.indexOf(phase);
  if (startIndex < 0) throw new BadRequestException(`Unknown phase ${phase}`);

  await this.pipelineState.setStatus(startupId, PipelineStatus.RUNNING);
  for (const p of cfg.slice(startIndex)) {
    await this.pipelineState.clearPhaseResult(startupId, p);
    await this.pipelineState.resetRetryCount(startupId, p);
    await this.pipelineState.resetPhase(startupId, p); // new helper sets pending + clears started/completed/error
  }
  await this.queuePhase(startupId, state.pipelineRunId, userId, phase);
}
```

**Step 4: Run tests to verify pass**

Run: `cd backend && bun test src/modules/ai/tests/services/pipeline.service.spec.ts -t "rerunFromPhase|retryPhase"`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/src/modules/ai/services/pipeline.service.ts backend/src/modules/ai/services/pipeline-state.service.ts backend/src/modules/ai/tests/services/pipeline.service.spec.ts backend/src/modules/startup/startup.service.ts backend/src/modules/startup/tests/startup.service.spec.ts
git commit -m "feat(ai): add force phase rerun with downstream reset"
```

### Task 4: Implement Specific Agent Retry (Research + Evaluation)

**Files:**
- Modify: `backend/src/modules/ai/services/research.service.ts`
- Modify: `backend/src/modules/ai/services/evaluation-agent-registry.service.ts`
- Modify: `backend/src/modules/ai/services/evaluation.service.ts`
- Modify: `backend/src/modules/startup/startup.service.ts`
- Test: `backend/src/modules/ai/tests/services/research.service.spec.ts`
- Test: `backend/src/modules/ai/tests/services/evaluation.service.spec.ts`
- Test: `backend/src/modules/startup/tests/startup.service.spec.ts`

**Step 1: Write failing tests for single-agent rerun**

```ts
it('reruns one research agent and merges only that output', async () => {
  const next = await service.rerunAgent('startup-1', 'market');
  expect(next.market).not.toBeNull();
  expect(next.team).toEqual(previous.team);
});

it('reruns one evaluation agent and updates summary counters', async () => {
  const next = await service.rerunAgent('startup-1', 'dealTerms');
  expect(next.summary.completedAgents + next.summary.failedAgents).toBe(11);
});
```

**Step 2: Run tests to verify failure**

Run: `cd backend && bun test src/modules/ai/tests/services/research.service.spec.ts src/modules/ai/tests/services/evaluation.service.spec.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
// ResearchService
async rerunAgent(startupId: string, key: ResearchAgentKey, feedback?: string) {
  const input = await this.loadPipelineInput(startupId);
  const current = await this.pipelineState.getPhaseResult(startupId, PipelinePhase.RESEARCH);
  const one = await this.runSingleAgent(key, RESEARCH_AGENTS[key], input, feedback);
  const merged = this.mergeResearchAgentResult(current, key, one);
  await this.pipelineState.setPhaseResult(startupId, PipelinePhase.RESEARCH, merged);
  return merged;
}
```

```ts
// EvaluationService
async rerunAgent(startupId: string, key: EvaluationAgentKey, feedback?: string) {
  const input = await this.loadPipelineInput(startupId);
  const current = await this.pipelineState.getPhaseResult(startupId, PipelinePhase.EVALUATION);
  const one = await this.registry.runOne(startupId, key, input, feedback);
  const merged = this.mergeEvaluationAgentResult(current, one);
  await this.pipelineState.setPhaseResult(startupId, PipelinePhase.EVALUATION, merged);
  return merged;
}
```

**Step 4: Run tests to verify pass**

Run: `cd backend && bun test src/modules/ai/tests/services/research.service.spec.ts src/modules/ai/tests/services/evaluation.service.spec.ts src/modules/startup/tests/startup.service.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/src/modules/ai/services/research.service.ts backend/src/modules/ai/services/evaluation-agent-registry.service.ts backend/src/modules/ai/services/evaluation.service.ts backend/src/modules/ai/tests/services/research.service.spec.ts backend/src/modules/ai/tests/services/evaluation.service.spec.ts backend/src/modules/startup/startup.service.ts backend/src/modules/startup/tests/startup.service.spec.ts
git commit -m "feat(ai): add targeted research/evaluation agent retry"
```

### Task 5: Wire Feedback into Prompt Context and Consumption

**Files:**
- Modify: `backend/src/modules/ai/services/research.service.ts`
- Modify: `backend/src/modules/ai/agents/evaluation/base-evaluation.agent.ts`
- Modify: `backend/src/modules/ai/services/synthesis-agent.service.ts`
- Modify: `backend/src/modules/ai/services/field-extractor.service.ts`
- Modify: `backend/src/modules/ai/tests/services/research.service.spec.ts`
- Modify: `backend/src/modules/ai/tests/agents/base-evaluation.agent.spec.ts`
- Modify: `backend/src/modules/ai/tests/services/synthesis-agent.service.spec.ts`

**Step 1: Write failing tests for prompt feedback context**

```ts
expect(call.prompt).toContain('feedbackContext');
expect(call.prompt).toContain('Use updated TAM assumptions');
```

**Step 2: Run tests to verify failure**

Run: `cd backend && bun test src/modules/ai/tests/services/research.service.spec.ts src/modules/ai/tests/agents/base-evaluation.agent.spec.ts src/modules/ai/tests/services/synthesis-agent.service.spec.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
const promptContext = {
  ...context,
  startupFormContext: pipelineInput.extraction.startupContext ?? {},
  feedbackContext: feedback.items.map((f) => ({ phase: f.phase, agent: f.agentKey, feedback: f.feedback })),
};
```

**Step 4: Run tests to verify pass**

Run: `cd backend && bun test src/modules/ai/tests/services/research.service.spec.ts src/modules/ai/tests/agents/base-evaluation.agent.spec.ts src/modules/ai/tests/services/synthesis-agent.service.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/src/modules/ai/services/research.service.ts backend/src/modules/ai/agents/evaluation/base-evaluation.agent.ts backend/src/modules/ai/services/synthesis-agent.service.ts backend/src/modules/ai/services/field-extractor.service.ts backend/src/modules/ai/tests/services/research.service.spec.ts backend/src/modules/ai/tests/agents/base-evaluation.agent.spec.ts backend/src/modules/ai/tests/services/synthesis-agent.service.spec.ts
git commit -m "feat(ai): inject feedback context into retry prompts"
```

### Task 6: Connect Endpoints to Startup Service + Downstream Recompute Rules

**Files:**
- Modify: `backend/src/modules/startup/startup.service.ts`
- Modify: `backend/src/modules/admin/admin.controller.ts`
- Modify: `backend/src/modules/startup/tests/startup.service.spec.ts`
- Modify: `backend/src/modules/admin/tests/admin.controller.spec.ts`

**Step 1: Write failing tests for service orchestration**

```ts
it('adminRetryAgent research reruns evaluation downstream', async () => {
  await service.adminRetryAgent(startupId, adminId, { phase: 'research', agent: 'market', feedback: '...' } as any);
  expect(pipelineService.rerunFromPhase).toHaveBeenCalledWith(startupId, PipelinePhase.EVALUATION, adminId);
});

it('adminRetryAgent evaluation reruns synthesis downstream', async () => {
  await service.adminRetryAgent(startupId, adminId, { phase: 'evaluation', agent: 'market', feedback: '...' } as any);
  expect(pipelineService.rerunFromPhase).toHaveBeenCalledWith(startupId, PipelinePhase.SYNTHESIS, adminId);
});
```

**Step 2: Run tests to verify failure**

Run: `cd backend && bun test src/modules/startup/tests/startup.service.spec.ts src/modules/admin/tests/admin.controller.spec.ts -t "retry"`
Expected: FAIL.

**Step 3: Implement minimal orchestration rules**

```ts
// startup.service.ts
if (dto.phase === PipelinePhase.RESEARCH) {
  await this.researchService.rerunAgent(id, dto.agent, dto.feedback);
  await this.aiPipeline.rerunFromPhase(id, PipelinePhase.EVALUATION, adminId);
} else {
  await this.evaluationService.rerunAgent(id, dto.agent, dto.feedback);
  await this.aiPipeline.rerunFromPhase(id, PipelinePhase.SYNTHESIS, adminId);
}
```

**Step 4: Run tests to verify pass**

Run: `cd backend && bun test src/modules/startup/tests/startup.service.spec.ts src/modules/admin/tests/admin.controller.spec.ts -t "retry"`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/src/modules/startup/startup.service.ts backend/src/modules/admin/admin.controller.ts backend/src/modules/startup/tests/startup.service.spec.ts backend/src/modules/admin/tests/admin.controller.spec.ts
git commit -m "feat(startup): orchestrate phase/agent retry with downstream reruns"
```

### Task 7: Frontend Admin UX + Orval Regeneration

**Files:**
- Modify: `backend/src/modules/admin/admin.controller.ts` (Swagger source for new routes)
- Generate: `frontend/src/api/generated/admin/admin.ts` (via Orval)
- Modify: `frontend/src/routes/_protected/admin/startup.$id.tsx`
- Modify: `frontend/src/components/startup-view/MemoTabContent.tsx`
- Modify: `frontend/src/types/evaluation.ts`

**Step 1: Add failing TS usage expectations**

```ts
// startup.$id.tsx (expected usage)
const retryPhaseMutation = useAdminControllerRetryStartupPhase();
const retryAgentMutation = useAdminControllerRetryStartupAgent();
```

**Step 2: Regenerate API client and run typecheck (expect initial failures until UI wired)**

Run: `cd frontend && bun run generate:api && bunx tsc --noEmit`
Expected: FAIL until new hooks are used correctly.

**Step 3: Implement minimal UI wiring**

```tsx
<MemoTabContent
  startup={startup}
  evaluation={evaluation}
  weights={stageWeights}
  adminFeedback={{
    onReanalyze: async (sectionKey, _evaluationId, comment) => {
      await retryAgentMutation.mutateAsync({
        id,
        data: { phase: 'evaluation', agent: mapSectionToAgent(sectionKey), feedback: comment },
      });
    },
    reanalyzingSection,
  }}
/>
```

**Step 4: Run checks**

Run: `cd frontend && bunx tsc --noEmit`
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/routes/_protected/admin/startup.$id.tsx frontend/src/components/startup-view/MemoTabContent.tsx frontend/src/types/evaluation.ts frontend/src/api/generated/admin/admin.ts
git commit -m "feat(frontend): add admin retry controls for phases and agents"
```

### Task 8: Final BTH Gate (Build, Test, Harden)

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/docs/ai-pipeline/IMPLEMENTATION-STATUS.md`

**Step 1: Build**

Run:
- `cd backend && bun run db:generate`
- `cd backend && bun run db:push`

Expected: schema + migration applied cleanly.

**Step 2: Test**

Run:
- `cd backend && bun test`
- `cd backend && bunx tsc --noEmit`
- `cd frontend && bunx tsc --noEmit`

Expected: all green.

**Step 3: Harden**
- Verify unhappy paths manually:
  - retry non-failed phase with `forceRerun=false` returns 400
  - invalid agent/phase combo returns 400
  - feedback entries marked consumed only after successful run
  - websocket/status updates still include `startupId` + `pipelineRunId`

**Step 4: Document rollout and rollback**
- Add env toggles in `.env.example` if needed:
  - `AI_RETRY_MAX_FEEDBACK_CONTEXT_ITEMS`
  - `AI_AGENT_RETRY_ENABLED`
- Add rollback note: disable `AI_AGENT_RETRY_ENABLED` to keep only full reanalyze.

**Step 5: Commit**

```bash
git add backend/.env.example backend/docs/ai-pipeline/IMPLEMENTATION-STATUS.md
git commit -m "chore(ai): finalize retry/feedback rollout documentation"
```

---

Plan complete and saved to `docs/plans/2026-02-08-phase9-retry-feedback-controls.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
