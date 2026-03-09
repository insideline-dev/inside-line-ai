# Trace System Prompt Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-agent system prompt visibility to the admin pipeline live trace modal with input tabs for user prompt and system prompt.

**Architecture:** Persist `systemPrompt` on pipeline agent trace rows, expose it through the startup progress DTO and frontend trace type, and render it in the existing trace dialog via a dedicated input tabs component. The UI keeps `User Prompt` as the default tab and falls back to a clear empty state for older traces without captured system prompts.

**Tech Stack:** NestJS, Drizzle ORM, Zod DTOs, React 19, shadcn/ui Tabs, Bun test

---

### Task 1: Backend trace contract

**Files:**
- Modify: `backend/src/modules/ai/entities/pipeline.schema.ts`
- Modify: `backend/src/modules/ai/services/pipeline-agent-trace.service.ts`
- Modify: `backend/src/modules/startup/dto/get-progress.dto.ts`
- Modify: `backend/src/modules/startup/startup.service.ts`
- Create: `backend/src/database/migrations/2026-03-09-pipeline-trace-system-prompt.sql`
- Test: `backend/src/modules/ai/tests/services/pipeline-agent-trace.service.spec.ts`

**Step 1: Write the failing test**

Add a test asserting `recordRun()` stores a `systemPrompt` field unchanged when provided.

**Step 2: Run test to verify it fails**

Run: `cd backend && bun test src/modules/ai/tests/services/pipeline-agent-trace.service.spec.ts`
Expected: FAIL because `systemPrompt` is not part of the persisted payload yet.

**Step 3: Write minimal implementation**

- Add `systemPrompt` to the trace table schema and trace service input.
- Persist it on insert.
- Add the field to the progress DTO and startup trace mapping.
- Add a SQL migration that appends the nullable column.

**Step 4: Run test to verify it passes**

Run: `cd backend && bun test src/modules/ai/tests/services/pipeline-agent-trace.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/entities/pipeline.schema.ts backend/src/modules/ai/services/pipeline-agent-trace.service.ts backend/src/modules/startup/dto/get-progress.dto.ts backend/src/modules/startup/startup.service.ts backend/src/modules/ai/tests/services/pipeline-agent-trace.service.spec.ts backend/src/database/migrations/2026-03-09-pipeline-trace-system-prompt.sql
git commit -m "feat: persist trace system prompts"
```

### Task 2: Trace producers

**Files:**
- Modify: `backend/src/modules/ai/interfaces/agent.interface.ts`
- Modify: `backend/src/modules/ai/agents/evaluation/base-evaluation.agent.ts`
- Modify: `backend/src/modules/ai/services/research.service.ts`
- Modify: `backend/src/modules/ai/agents/synthesis/synthesis.agent.ts`
- Modify: `backend/src/modules/ai/processors/synthesis.processor.ts`
- Modify: `backend/src/modules/ai/services/evaluation-agent-registry.service.ts`

**Step 1: Write the failing test**

Use the backend trace persistence test path plus existing trace-producing codepaths as the contract, then add the minimal typed changes needed so each producer can forward `systemPrompt`.

**Step 2: Run type check to verify breakage is real**

Run: `cd backend && bunx tsc --noEmit`
Expected: FAIL until all trace event payloads include the new optional field where required.

**Step 3: Write minimal implementation**

- Add optional `systemPrompt` to trace event interfaces and payloads.
- Forward composed system prompt from evaluation.
- Forward request system prompt from research.
- Forward synthesis system prompt through synthesis trace payloads.

**Step 4: Run type check to verify it passes**

Run: `cd backend && bunx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/modules/ai/interfaces/agent.interface.ts backend/src/modules/ai/agents/evaluation/base-evaluation.agent.ts backend/src/modules/ai/services/research.service.ts backend/src/modules/ai/agents/synthesis/synthesis.agent.ts backend/src/modules/ai/processors/synthesis.processor.ts backend/src/modules/ai/services/evaluation-agent-registry.service.ts
git commit -m "feat: propagate system prompts into agent traces"
```

### Task 3: Frontend trace modal tabs

**Files:**
- Modify: `frontend/src/types/pipeline-progress.ts`
- Modify: `frontend/src/components/startup-view/AdminPipelineLivePanel.tsx`
- Create: `frontend/tests/AdminPipelineLivePanel.test.tsx`

**Step 1: Write the failing test**

Add a rendering test for the trace input panel asserting:
- both `User Prompt` and `System Prompt` tabs render
- user prompt is the default visible content
- system prompt content path is rendered for the provided trace data

**Step 2: Run test to verify it fails**

Run: `cd frontend && bun test tests/AdminPipelineLivePanel.test.tsx`
Expected: FAIL because the input tabs component does not exist yet.

**Step 3: Write minimal implementation**

- Add `systemPrompt` to the frontend trace type.
- Extract a trace input tabs component or helper from the modal.
- Use shadcn `Tabs` inside the `Input` pane.
- Keep output and metadata sections unchanged.

**Step 4: Run test to verify it passes**

Run: `cd frontend && bun test tests/AdminPipelineLivePanel.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/types/pipeline-progress.ts frontend/src/components/startup-view/AdminPipelineLivePanel.tsx frontend/tests/AdminPipelineLivePanel.test.tsx
git commit -m "feat: show trace system prompts in modal tabs"
```

### Task 4: Verification

**Files:**
- Modify: `frontend/src/api/generated/model/getProgressResponseDtoProgress.ts` if regenerated
- Modify: `frontend/openapi.json` if regenerated

**Step 1: Run targeted tests**

Run:
- `cd backend && bun test src/modules/ai/tests/services/pipeline-agent-trace.service.spec.ts`
- `cd frontend && bun test tests/AdminPipelineLivePanel.test.tsx`

Expected: PASS

**Step 2: Run type checks**

Run:
- `cd backend && bunx tsc --noEmit`
- `cd frontend && bunx tsc --noEmit`

Expected: PASS

**Step 3: Run lint if the touched files need cleanup**

Run:
- `cd backend && bun lint`

Expected: PASS or no new findings in touched files

**Step 4: Commit**

```bash
git add docs/plans/2026-03-09-trace-system-prompt-design.md docs/plans/2026-03-09-trace-system-prompt-plan.md
git commit -m "docs: add trace system prompt design and plan"
```
