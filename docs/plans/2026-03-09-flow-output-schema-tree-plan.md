# Flow Output Schema Tree Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose prompt output schemas from the backend and render them as a readable nested tree in the `/admin/flow` node sheet.

**Architecture:** Add a small admin endpoint that returns the compiled output schema descriptor for a prompt key, then consume that descriptor in the frontend with a recursive presentational renderer. Keep the UI read-only and data-driven so it stays aligned with backend code schemas.

**Tech Stack:** NestJS, Zod DTOs, React 19, TanStack Query, Bun test, Orval-generated API types

---

### Task 1: Backend output schema endpoint

**Files:**
- Modify: `backend/src/modules/admin/admin.controller.ts`
- Modify: `backend/src/modules/admin/tests/admin.controller.spec.ts`
- Test: `backend/src/modules/admin/tests/admin.controller.spec.ts`

**Step 1: Write the failing test**

Add a controller spec that calls `getAiPromptOutputSchema("evaluation.market")` and expects the controller to delegate to the schema registry service and return the resolved descriptor payload.

**Step 2: Run test to verify it fails**

Run: `cd backend && bun test src/modules/admin/tests/admin.controller.spec.ts`
Expected: FAIL because the controller method and provider wiring do not exist yet.

**Step 3: Write minimal implementation**

Inject `AgentSchemaRegistryService` into `AdminController` and add `GET /admin/ai-prompts/:key/output-schema` returning `AiPromptOutputSchemaResponseDto`.

**Step 4: Run test to verify it passes**

Run: `cd backend && bun test src/modules/admin/tests/admin.controller.spec.ts`
Expected: PASS

### Task 2: Frontend output schema tree

**Files:**
- Modify: `frontend/src/components/pipeline/prompt-editor/OutputSchemaViewer.tsx`
- Add: `frontend/tests/OutputSchemaViewer.test.tsx`
- Test: `frontend/tests/OutputSchemaViewer.test.tsx`

**Step 1: Write the failing test**

Add a render test for `OutputSchemaViewer` that verifies nested object and array fields are shown as readable rows with type labels.

**Step 2: Run test to verify it fails**

Run: `cd frontend && bun test tests/OutputSchemaViewer.test.tsx`
Expected: FAIL because the viewer still renders placeholder copy.

**Step 3: Write minimal implementation**

Fetch the schema descriptor for the active prompt key, then render it recursively as a compact nested tree showing field name and type for all descendants.

**Step 4: Run test to verify it passes**

Run: `cd frontend && bun test tests/OutputSchemaViewer.test.tsx`
Expected: PASS

### Task 3: API client alignment and verification

**Files:**
- Modify: `frontend/src/api/generated/admin/admin.ts` only via generation if endpoint appears in OpenAPI
- Modify: `frontend/openapi.json` only via generation if needed

**Step 1: Regenerate API client if the new endpoint is included in Swagger**

Run: `cd frontend && bun generate:api`
Expected: generated types/hooks include the output schema endpoint, or generation is blocked because backend docs are unavailable.

**Step 2: Use generated client if available**

Swap any temporary fetch code to the generated Orval hook if the endpoint was generated.

**Step 3: Run focused verification**

Run:
- `cd backend && bun test src/modules/admin/tests/admin.controller.spec.ts`
- `cd frontend && bun test tests/OutputSchemaViewer.test.tsx`
- `cd backend && bunx tsc --noEmit`
- `cd frontend && bunx tsc --noEmit`

Expected: targeted tests pass and type-check is clean.
