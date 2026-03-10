# Output Schema Read-Only (Phase 1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove runtime schema editing paths and replace admin schema editing UI with a read-only output-structure viewer, while keeping `ai_agent_schema_revisions` table temporarily (two-step deprecation).

**Architecture:** Phase 1 removes UI editing and schema-revision CRUD API paths, and resolves output schema from code only. DB table/entity stay in place to avoid migration risk in this rollout. Phase 2 (separate) will drop table + remaining legacy references after stabilization.

**Tech Stack:** React 19 + TanStack Query + shadcn/ui (frontend), NestJS + Drizzle + Zod + Bun test runner (backend)

---

## Scope Guardrails (Phase 1)

- ✅ Replace `SchemaRevisionEditor` with read-only viewer.
- ✅ Remove schema-revision endpoints from admin controller.
- ✅ Remove schema-revision write/list methods from `AgentSchemaRegistryService` and make schema resolution code-only.
- ✅ Remove obsolete DTOs/tests tied to removed endpoints.
- ✅ Regenerate frontend API client.
- ❌ Do **not** drop `ai_agent_schema_revisions` table yet.
- ❌ Do **not** create DB migration in this phase.

---

### Task 1: Add read-only output schema viewer component

**Files:**
- Create: `frontend/src/components/pipeline/prompt-editor/OutputSchemaViewer.tsx`
- Reference pattern: `frontend/src/components/pipeline/SchemaTreeView.tsx`
- Test via usage: `frontend/src/components/pipeline/NodePromptEditor.tsx`

**Step 1: Write the failing test/check (compile-driven)**

Run: `cd frontend && bunx tsc --noEmit`

Expected (after wiring in Task 2 before creating component): TS error like `Cannot find module './prompt-editor/OutputSchemaViewer'`.

**Step 2: Implement minimal read-only viewer**

Create component that:
- calls `useAdminControllerGetAiPromptOutputSchema(promptKey)`
- shows section label `Output Structure`
- shows `Source: code` badge
- renders collapsible tree rows: `field` (mono), `type` badge, optional description
- has no copy/insert/publish/edit actions

```tsx
export function OutputSchemaViewer({ promptKey }: { promptKey: string }) {
  // load output schema
  // normalize jsonSchema payload
  // render collapsible tree (read-only)
}
```

**Step 3: Handle loading/error/empty states**

- Loading spinner text
- Graceful “No fields defined”
- Error fallback text

**Step 4: Run typecheck**

Run: `cd frontend && bunx tsc --noEmit`
Expected: PASS for this new file (or only unrelated pre-existing errors if any).

**Step 5: Commit**

```bash
git add frontend/src/components/pipeline/prompt-editor/OutputSchemaViewer.tsx
git commit -m "feat(admin): add read-only output schema viewer"
```

---

### Task 2: Replace schema editor usage in node prompt editor

**Files:**
- Modify: `frontend/src/components/pipeline/NodePromptEditor.tsx` (import + render slot)
- Delete: `frontend/src/components/pipeline/prompt-editor/SchemaRevisionEditor.tsx`

**Step 1: Write the failing check**

Temporarily switch import/render to new component before creating/deleting files.

Run: `cd frontend && bunx tsc --noEmit`
Expected: FAIL until new component exists and old references are removed.

**Step 2: Swap component reference**

- Replace import:
  - from `SchemaRevisionEditor`
  - to `OutputSchemaViewer`
- Replace render:
  - `<SchemaRevisionEditor promptKey={promptKey} />`
  - with `<OutputSchemaViewer promptKey={promptKey} />`

**Step 3: Delete old editor file**

Remove:
- `frontend/src/components/pipeline/prompt-editor/SchemaRevisionEditor.tsx`

**Step 4: Run typecheck**

Run: `cd frontend && bunx tsc --noEmit`
Expected: PASS (no missing import/reference for deleted editor).

**Step 5: Commit**

```bash
git add frontend/src/components/pipeline/NodePromptEditor.tsx frontend/src/components/pipeline/prompt-editor/SchemaRevisionEditor.tsx
git commit -m "refactor(admin): replace schema revision editor with read-only viewer"
```

---

### Task 3: Remove schema revision CRUD/list endpoints from admin controller

**Files:**
- Modify: `backend/src/modules/admin/admin.controller.ts`

**Step 1: Write failing test updates first**

In `admin.controller.spec.ts`, remove/adjust cases that assert removed endpoints/method calls:
- `getAiSchemaRevisions`
- `createAiSchemaRevision`
- `updateAiSchemaRevision`
- `publishAiSchemaRevision`

Run: `cd backend && bun test src/modules/admin/tests/admin.controller.spec.ts`
Expected: FAIL until controller + mocks are aligned.

**Step 2: Remove controller routes/methods**

Delete these methods/routes:
- `GET ai-prompts/:key/schema-revisions`
- `GET ai/schemas/:promptKey`
- `POST ai-prompts/:key/schema-revisions`
- `POST ai/schemas/:promptKey`
- `PATCH ai-prompts/:key/schema-revisions/:revisionId`
- `PATCH ai/schemas/:promptKey/:revisionId`
- `POST ai-prompts/:key/schema-revisions/:revisionId/publish`
- `POST ai/schemas/:promptKey/:revisionId/publish`

Keep:
- `getAiSchemaResolved`, `getAiSchemaResolvedAlias`
- `getAiPromptOutputSchema`

**Step 3: Clean imports in controller**

Remove unused DTO imports from `./dto` list:
- `CreateAiSchemaRevisionDto`
- `UpdateAiSchemaRevisionDto`
- `AiSchemaRevisionsResponseDto`
- `AiSchemaRevisionResponseDto`

Keep `AiResolvedSchemaResponseDto` and `AiPromptOutputSchemaResponseDto`.

**Step 4: Run backend test and typecheck**

Run:
- `cd backend && bun test src/modules/admin/tests/admin.controller.spec.ts`
- `cd backend && bunx tsc --noEmit`

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/src/modules/admin/admin.controller.ts backend/src/modules/admin/tests/admin.controller.spec.ts
git commit -m "refactor(admin): remove schema revision CRUD/list endpoints"
```

---

### Task 4: Simplify schema DTOs for read-only paths only

**Files:**
- Modify: `backend/src/modules/admin/dto/ai-schema.dto.ts`
- Modify (if needed): `backend/src/modules/admin/dto/index.ts`

**Step 1: Write failing check**

Run: `cd backend && bunx tsc --noEmit`
Expected: FAIL after Task 3 until DTO exports/imports are reconciled.

**Step 2: Remove obsolete DTO schemas/classes**

Remove:
- `CreateAiSchemaRevisionSchema` / `CreateAiSchemaRevisionDto`
- `UpdateAiSchemaRevisionSchema` / `UpdateAiSchemaRevisionDto`
- `AiSchemaRevisionSchema` / `AiSchemaRevisionResponseDto`
- `AiSchemaRevisionsResponseSchema` / `AiSchemaRevisionsResponseDto`

Keep:
- `AiResolvedSchemaResponseSchema` / `AiResolvedSchemaResponseDto`

Adjust source enum to code-only if runtime source is now code-only in Task 5.

**Step 3: Reconcile DTO barrel exports**

Ensure `backend/src/modules/admin/dto/index.ts` still exports valid symbols only.

**Step 4: Run typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/src/modules/admin/dto/ai-schema.dto.ts backend/src/modules/admin/dto/index.ts
git commit -m "refactor(admin): remove schema revision DTOs for deprecated endpoints"
```

---

### Task 5: Make AgentSchemaRegistryService code-driven only

**Files:**
- Modify: `backend/src/modules/ai/services/agent-schema-registry.service.ts`

**Step 1: Write failing test/check**

Run targeted checks after removing service methods referenced by controller/tests:
- `cd backend && bun test src/modules/admin/tests/admin.controller.spec.ts`
Expected: FAIL until controller/spec cleanup complete.

**Step 2: Remove schema-revision mutation/list logic**

Remove methods and related types:
- `listRevisionsByKey`
- `getPublished`
- `createDraft`
- `updateDraft`
- `publishRevision`
- `findPublishedDescriptor`
- `getOrCreateDefinition`
- interfaces `CreateSchemaDraftInput`, `UpdateSchemaDraftInput`

**Step 3: Simplify resolver methods**

- `resolveDescriptor`: always return `resolveCodeDescriptor` for valid prompt keys
- `resolveDescriptorWithSource`: always return `{ source: "code" }`
- keep `resolveSchema`, `resolveCodeDescriptor`, `assertDescriptor`, `normalizeStage`

Remove now-unused imports/dependencies (`aiAgentSchemaRevision`, Drizzle queries, optional config gating if not needed).

**Step 4: Run backend checks**

Run:
- `cd backend && bunx tsc --noEmit`
- `cd backend && bun lint`

Expected: PASS with no warnings/errors.

**Step 5: Commit**

```bash
git add backend/src/modules/ai/services/agent-schema-registry.service.ts
git commit -m "refactor(ai): make schema registry resolve output schema from code only"
```

---

### Task 6: Remove schema revision seeding side-effect from prompt seeding

**Files:**
- Modify: `backend/src/modules/ai/services/ai-prompt.service.ts`

**Step 1: Write failing check**

Run: `cd backend && bunx tsc --noEmit`
Expected: may fail after removing entity import/usages until method body is cleaned.

**Step 2: Remove schema revision seed block in `seedFromCode()`**

Delete block that:
- builds `agentSchemaEntries`
- checks existing published in `aiAgentSchemaRevision`
- inserts into `aiAgentSchemaRevision`
- updates `seededSchemaRevisions` / `skippedSchemaRevisions`

Update return payload fields accordingly (remove/adjust schema-seeding counters).

**Step 3: Clean imports**

Remove unused imports tied to schema-revision seeding only.

**Step 4: Run backend checks**

Run:
- `cd backend && bunx tsc --noEmit`
- `cd backend && bun test src/modules/admin/tests/admin.controller.spec.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/src/modules/ai/services/ai-prompt.service.ts
git commit -m "refactor(ai): stop seeding deprecated schema revision records"
```

---

### Task 7: Regenerate API client and finalize integration verification

**Files:**
- Regenerate: `frontend/openapi.json`
- Regenerate: `frontend/src/api/generated/**`
- Verify usage cleanup: `frontend/src/components/pipeline/**`

**Step 1: Regenerate OpenAPI + frontend client**

Run:
- `cd frontend && bun generate:api`

Expected:
- schema-revision CRUD/list hooks/types removed from generated client.

**Step 2: Confirm no stale references**

Run content checks for removed symbols:
- `SchemaRevisionEditor`
- `useAdminControllerGetAiSchemaRevisionsAlias`
- `useAdminControllerCreateAiSchemaRevisionAlias`
- `useAdminControllerUpdateAiSchemaRevisionAlias`
- `useAdminControllerPublishAiSchemaRevisionAlias`

Expected: no matches in non-generated app code.

**Step 3: Run full required verification**

Run:
- `cd backend && bunx tsc --noEmit`
- `cd frontend && bunx tsc --noEmit`
- `cd backend && bun lint`
- `cd backend && bun test`

Expected: all pass.

**Step 4: Manual verification**

- Open admin pipeline flow.
- Click agent node → Prompts tab.
- Confirm `Output Structure` section is visible and read-only.
- Confirm badge indicates source is code-defined.
- Confirm no save/publish schema controls exist.
- Confirm Input/Output tab still renders declared output badges.

**Step 5: Commit**

```bash
git add frontend/openapi.json frontend/src/api/generated
git commit -m "chore(api): regenerate client after schema revision endpoint removal"
```

---

## Task Graph

- Task 1 → Task 2
- Task 3 ↔ Task 4 (can overlap, but imports must be reconciled)
- Task 5 depends on Task 3/4
- Task 6 depends on Task 5
- Task 7 depends on Tasks 1–6

---

## Phase 2 (separate follow-up, not in this rollout)

- Drop `ai_agent_schema_revisions` table with migration.
- Remove entity exports and remaining table readers (e.g., template snapshot schema section if still coupled).
- Run db generate/push and API regen again.

---

## How to Test (bullet checklist)

- [ ] `cd backend && bunx tsc --noEmit`
- [ ] `cd frontend && bunx tsc --noEmit`
- [ ] `cd backend && bun lint`
- [ ] `cd backend && bun test src/modules/admin/tests/admin.controller.spec.ts`
- [ ] `cd backend && bun test`
- [ ] Manual admin UI check: Prompts tab shows read-only output structure, no schema edit actions

---

## Review Notes Template (fill during execution)

- What changed:
- Why it is minimal:
- Verification evidence (commands + outputs):
- Risks left for Phase 2:

---

## Unresolved Questions

- None (rollout strategy locked: two-step deprecation).